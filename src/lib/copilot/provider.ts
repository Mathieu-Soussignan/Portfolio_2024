/**
 * Provider abstraction + hybrid engine.
 *
 *   CopilotEngine
 *     ├── LocalCopilotProvider   (deterministic V1 — source of truth)
 *     └── MistralCopilotProvider (grounded LLM synthesis, validated)
 *
 * The deterministic V1 answer is always computed first: it carries the evidence
 * ceiling and the hard guards (out-of-scope, manipulation, NO_EVIDENCE). The
 * Mistral provider is only attempted when V1 has a grounded, in-scope answer,
 * and its output is validated before display. On any failure the V1 answer is
 * returned — Mistral never replaces the truth of the portfolio.
 */

import { buildCopilotContext } from "./context.ts";
import { buildCopilotResponse } from "./response.ts";
import { generateSuggestions } from "./suggestions.ts";
import { validateCopilotGeneration } from "./validation.ts";
import type {
	ConfidenceLevel,
	CopilotContext,
	CopilotEngine,
	CopilotGenerationRequest,
	CopilotProvider,
	CopilotResponse,
	IntentKind,
	MistralGeneration,
	PortfolioKnowledge,
	ProjectReference,
	QueryIntent,
} from "./types.ts";

/** Intents where the deterministic answer is precise and LLM adds no value. */
const LOCAL_ONLY_INTENTS: IntentKind[] = ["greeting", "help", "contact"];

/**
 * Decide whether an already-computed V1 answer may be enhanced by Mistral.
 * Hard guards stay local: refusals, out-of-scope and evidence gaps are never
 * handed to the LLM.
 */
export function shouldUseMistral(base: CopilotResponse): boolean {
	if (base.kind === "unknown") return false;
	if (base.confidence === "NO_EVIDENCE" || base.confidence === "PARTIAL_MATCH") return false;
	if (LOCAL_ONLY_INTENTS.includes(base.intent.kind)) return false;
	return true;
}

/** Deterministic provider — wraps the existing V1 response builder. */
export function createLocalCopilotProvider(knowledge: PortfolioKnowledge, now: number = Date.now()): CopilotProvider {
	return {
		name: "local",
		async generate(request: CopilotGenerationRequest): Promise<CopilotResponse> {
			const response = buildCopilotResponse(knowledge, request.question, now);
			response.generatedBy = "local";
			return response;
		},
	};
}

/** Map a validated generation's project references back to portfolio projects. */
function resolveProjectReferences(references: string[], knowledge: PortfolioKnowledge): ProjectReference[] {
	const result: ProjectReference[] = [];
	for (const reference of references) {
		const target = reference.trim().toLowerCase();
		const project = knowledge.projects.find(
			(p) => p.slug.toLowerCase() === target || p.title.toLowerCase() === target
		);
		if (project && !result.some((r) => r.slug === project.slug)) {
			result.push({ slug: project.slug, title: project.title, url: project.url, tags: project.tags });
		}
	}
	return result;
}

/** Convert a validated Mistral generation into a render-ready response. */
export function toCopilotResponse(
	generation: MistralGeneration,
	knowledge: PortfolioKnowledge,
	intent: QueryIntent,
	question: string,
	context: CopilotContext,
	baseConfidence: ConfidenceLevel | null
): CopilotResponse {
	const references = resolveProjectReferences(generation.referencedProjects ?? [], knowledge);

	return {
		question,
		intent,
		kind: "known",
		headline: generation.answer,
		bullets: generation.reasoningSummary ? [generation.reasoningSummary] : [],
		projects: references,
		links: references.length
			? references.map((r) => ({ label: `Voir ${r.title}`, href: r.url, kind: "project" as const }))
			: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" as const }],
		confidence: baseConfidence ?? undefined,
		evidence: context.evidence.length > 0 ? context.evidence : undefined,
		sources: ["Knowledge base du portfolio (contexte limité aux preuves pertinentes)"],
		generatedBy: "mistral",
		suggestions: [],
	};
}

export interface MistralProviderOptions {
	knowledge: PortfolioKnowledge;
	endpoint?: string;
	fetchImpl?: typeof fetch;
	now?: number;
}

/** Mistral provider — calls the server proxy and validates the result locally. */
export function createMistralCopilotProvider(options: MistralProviderOptions): CopilotProvider {
	const { knowledge, endpoint = "/api/copilot", fetchImpl = fetch } = options;

	return {
		name: "mistral",
		async generate(request: CopilotGenerationRequest): Promise<CopilotResponse> {
			const response = await fetchImpl(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ question: request.question, context: request.context }),
			});

			if (!response.ok) {
				throw new Error(`mistral endpoint status ${response.status}`);
			}

			const payload = (await response.json()) as { ok?: boolean; generation?: MistralGeneration };
			if (!payload?.ok || !payload.generation) {
				throw new Error("invalid mistral payload");
			}

			const validation = validateCopilotGeneration(payload.generation, knowledge, request.context, request.baseConfidence);
			if (!validation.ok) {
				throw new Error(`mistral validation failed: ${validation.reason}`);
			}

			return toCopilotResponse(payload.generation, knowledge, request.intent, request.question, request.context, request.baseConfidence);
		},
	};
}

export interface HybridEngineOptions {
	now?: number;
	mistral?: {
		enabled?: boolean;
		provider?: CopilotProvider;
	};
}

/** Hybrid engine: deterministic V1 as source of truth, grounded Mistral on top. */
export function createHybridCopilotEngine(knowledge: PortfolioKnowledge, options: HybridEngineOptions = {}): CopilotEngine {
	const now = options.now ?? Date.now();
	const mistral = options.mistral?.provider ?? createMistralCopilotProvider({ knowledge, now });
	const mistralEnabled = options.mistral?.enabled !== false;

	return {
		async ask(question: string): Promise<CopilotResponse> {
			// 1. Deterministic V1 answer (authoritative + guards + evidence ceiling).
			const base = buildCopilotResponse(knowledge, question, now);
			base.suggestions = generateSuggestions(knowledge);

			// 2. Hard guards: never hand a refusal or evidence gap to the LLM.
			if (!mistralEnabled || !shouldUseMistral(base)) {
				return base;
			}

			// 3. Grounded Mistral synthesis, validated; V1 on any failure.
			try {
				const context = buildCopilotContext(knowledge, base.intent);
				const response = await mistral.generate({
					question: question.trim(),
					intent: base.intent,
					context,
					baseConfidence: base.confidence ?? null,
				});
				response.suggestions = generateSuggestions(knowledge);
				return response;
			} catch {
				return base;
			}
		},
		suggest(): string[] {
			return generateSuggestions(knowledge);
		},
	};
}
