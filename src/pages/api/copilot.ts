import type { APIRoute } from "astro";
import { callMistralChat, MISTRAL_DEFAULT_MODEL } from "../../lib/copilot/server/mistral.ts";
import { createRateLimiter } from "../../lib/copilot/server/rate-limit.ts";
import type { ConfidenceLevel, CopilotContext, MistralGeneration } from "../../lib/copilot/types.ts";

/**
 * Server-only Mistral proxy.
 *
 * The browser never holds MISTRAL_API_KEY: it POSTs the question + grounding
 * context here, this route calls Mistral, and returns the structured output.
 * The client validates the result against its local knowledge base and falls
 * back to the deterministic V1 engine on any failure.
 */
export const prerender = false;

const MAX_QUESTION_LENGTH = 500;
const MAX_SKILLS = 40;
const MAX_PROJECTS = 6;

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

function clientKey(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	return forwarded?.split(",")[0]?.trim() || "local";
}

function json(status: number, payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown, max: number): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 200)).slice(0, max);
}

const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["EXACT_MATCH", "HIGH_CONFIDENCE", "PARTIAL_MATCH", "NO_EVIDENCE"];

function asConfidence(value: unknown): ConfidenceLevel | null {
	return typeof value === "string" && (CONFIDENCE_LEVELS as string[]).includes(value) ? (value as ConfidenceLevel) : null;
}

/** Coerce a client-provided context into a safe shape (never trust the body). */
function sanitizeContext(raw: unknown): CopilotContext | null {
	if (!raw || typeof raw !== "object") return null;
	const context = raw as Record<string, unknown>;
	const profile = context.profile as Record<string, unknown> | undefined;
	if (!profile || typeof profile !== "object") return null;

	return {
		profile: {
			name: asString(profile.name).slice(0, 120),
			role: asString(profile.role).slice(0, 120),
			company: asString(profile.company).slice(0, 120),
			location: asString(profile.location).slice(0, 120),
			summary: asString(profile.summary).slice(0, 600),
			training: asStringArray(profile.training, 8),
		},
		skills: asStringArray(context.skills, MAX_SKILLS),
		experience: (Array.isArray(context.experience) ? context.experience : [])
			.slice(0, 10)
			.map((item) => {
				const exp = (item ?? {}) as Record<string, unknown>;
				return {
					period: asString(exp.period).slice(0, 80),
					title: asString(exp.title).slice(0, 160),
					company: asString(exp.company).slice(0, 160),
					description: asString(exp.description).slice(0, 500),
				};
			}),
		projects: (Array.isArray(context.projects) ? context.projects : [])
			.slice(0, MAX_PROJECTS)
			.map((item) => {
				const project = (item ?? {}) as Record<string, unknown>;
				return {
					slug: asString(project.slug).slice(0, 120),
					title: asString(project.title).slice(0, 160),
					description: asString(project.description).slice(0, 800),
					tags: asStringArray(project.tags, 14),
					url: asString(project.url).slice(0, 240),
				};
			}),
		evidence: asStringArray(context.evidence, 20),
		confidence: asConfidence(context.confidence),
		outOfScope: false,
	};
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const rate = rateLimiter.check(clientKey(request));
		if (!rate.allowed) {
			return json(429, { ok: false, error: "rate_limited", retryAfterMs: rate.retryAfterMs });
		}

		// Astro/Vite loads `.env*` files into `import.meta.env` (not `process.env`).
		// The `process.env` fallback covers hosts that inject the key at runtime.
		const apiKey = import.meta.env.MISTRAL_API_KEY ?? process.env.MISTRAL_API_KEY;
		if (!apiKey) {
			return json(503, { ok: false, error: "not_configured" });
		}
		const model = import.meta.env.MISTRAL_MODEL ?? process.env.MISTRAL_MODEL ?? MISTRAL_DEFAULT_MODEL;

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json(400, { ok: false, error: "bad_request" });
		}

		const raw = (body ?? {}) as Record<string, unknown>;
		const question = asString(raw.question).trim();
		if (!question || question.length > MAX_QUESTION_LENGTH) {
			return json(400, { ok: false, error: "bad_request" });
		}

		const context = sanitizeContext(raw.context);
		if (!context) {
			return json(400, { ok: false, error: "bad_request" });
		}

		const result = await callMistralChat(apiKey, model, question, context);

		if (!result.ok) {
			return json(result.status === 429 ? 429 : 502, { ok: false, error: result.error });
		}

		const generation: MistralGeneration = result.generation;
		return json(200, { ok: true, generation, model: result.model });
	} catch {
		// Never leak a stack trace or a 500 to the visitor — the client falls
		// back to the deterministic engine on any failure.
		return json(502, { ok: false, error: "internal_error" });
	}
};
