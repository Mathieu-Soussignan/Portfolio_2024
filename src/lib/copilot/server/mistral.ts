/**
 * Server-only Mistral HTTP client.
 *
 * Lives behind the /api/copilot route — never bundled to the browser. Kept as a
 * pure function (fetch is injectable) so it is unit-testable without a real key
 * and without Node globals.
 */

import { buildMistralMessages } from "../prompt.ts";
import type { CopilotContext, EvidenceClaim, MistralGeneration } from "../types.ts";

export const MISTRAL_DEFAULT_MODEL = "mistral-small-latest";
export const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

export type MistralChatResult =
	| { ok: true; generation: MistralGeneration; model: string }
	| { ok: false; status: number; error: string };

export interface MistralChatOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	maxTokens?: number;
	temperature?: number;
	baseUrl?: string;
}

/** Extract the first JSON object from a (possibly fenced) model response. */
export function extractJson(content: string): unknown {
	let text = content.trim();
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

/** Light structural check that the upstream payload looks like a generation. */
export function parseGeneration(content: string): MistralGeneration | null {
	const parsed = extractJson(content);
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	if (typeof obj.answer !== "string" || obj.answer.trim().length === 0) return null;

	const generation: MistralGeneration = { answer: obj.answer.trim() };
	if (obj.confidence === null || typeof obj.confidence === "string") {
		generation.confidence = obj.confidence as MistralGeneration["confidence"];
	}
	if (Array.isArray(obj.referencedProjects)) {
		generation.referencedProjects = obj.referencedProjects.filter((x): x is string => typeof x === "string");
	}
	if (Array.isArray(obj.referencedTechnologies)) {
		generation.referencedTechnologies = obj.referencedTechnologies.filter((x): x is string => typeof x === "string");
	}
	if (typeof obj.reasoningSummary === "string") generation.reasoningSummary = obj.reasoningSummary;
	if (typeof obj.outOfScope === "boolean") generation.outOfScope = obj.outOfScope;
	if (Array.isArray(obj.claims)) {
		generation.claims = obj.claims
			.filter((claim): claim is Record<string, unknown> => !!claim && typeof claim === "object")
			.map((claim) => ({
				text: typeof claim.text === "string" ? claim.text : "",
				evidenceIds: Array.isArray(claim.evidenceIds)
					? claim.evidenceIds.filter((id): id is string => typeof id === "string")
					: [],
				kind: (typeof claim.kind === "string" ? claim.kind : "") as EvidenceClaim["kind"],
			}));
	}

	return generation;
}

function parseRetryAfterMs(header: string | null): number {
	if (!header) return 0;
	const seconds = Number.parseFloat(header);
	if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 3000);
	return 0;
}

/**
 * Call the Mistral chat-completions endpoint. Never throws — returns a
 * discriminated result so the caller can decide (and the client falls back).
 */
export async function callMistralChat(
	apiKey: string,
	model: string,
	question: string,
	context: CopilotContext,
	options: MistralChatOptions = {}
): Promise<MistralChatResult> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 15000;
	const baseUrl = options.baseUrl ?? MISTRAL_API_URL;

	const body = JSON.stringify({
		model,
		temperature: options.temperature ?? 0.2,
		max_tokens: options.maxTokens ?? 700,
		response_format: { type: "json_object" },
		messages: buildMistralMessages(question, context),
	});

	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
	};

	let response: Response;
	try {
		response = await fetchImpl(baseUrl, {
			method: "POST",
			headers,
			body,
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch {
		return { ok: false, status: 502, error: "upstream_unreachable" };
	}

	// One light retry on quota throttling, respecting (and capping) Retry-After.
	if (response.status === 429) {
		const delay = parseRetryAfterMs(response.headers.get("retry-after"));
		if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
		try {
			response = await fetchImpl(baseUrl, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch {
			return { ok: false, status: 502, error: "upstream_unreachable" };
		}
	}

	if (!response.ok) {
		return { ok: false, status: response.status, error: response.status === 429 ? "quota_exceeded" : "upstream_error" };
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		return { ok: false, status: 502, error: "invalid_upstream_json" };
	}

	const content = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
	if (typeof content !== "string") {
		return { ok: false, status: 502, error: "invalid_upstream_payload" };
	}

	const generation = parseGeneration(content);
	if (!generation) {
		return { ok: false, status: 502, error: "invalid_generation_json" };
	}

	return { ok: true, generation, model };
}
