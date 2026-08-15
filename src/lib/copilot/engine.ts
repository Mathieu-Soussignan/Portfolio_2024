/**
 * Copilot controller.
 *
 * Wires the pipeline together:
 *
 *   UI → ask() → Intent Detection → Knowledge Retrieval → Response Generation
 *
 * The UI only depends on this tiny `CopilotEngine` interface, so the local
 * deterministic engine below can later be swapped for an LLM / RAG / agent
 * implementation without touching the terminal markup or rendering.
 */

import { buildCopilotResponse } from "./response.ts";
import { generateSuggestions } from "./suggestions.ts";
import type { CopilotEngine, CopilotResponse, PortfolioKnowledge } from "./types.ts";

export function createCopilotEngine(knowledge: PortfolioKnowledge, now: number = Date.now()): CopilotEngine {
	return {
		ask(question: string): CopilotResponse {
			const response = buildCopilotResponse(knowledge, question, now);
			response.suggestions = generateSuggestions(knowledge);
			return response;
		},
		suggest(): string[] {
			return generateSuggestions(knowledge);
		},
	};
}
