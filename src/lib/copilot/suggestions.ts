/**
 * Smart suggestions — generated from the actual portfolio data, never a
 * hardcoded list that could drift out of sync with the projects.
 */

import { projectsUsingTechnology, searchProjects } from "./retrieval.ts";
import type { PortfolioKnowledge } from "./types.ts";

export function generateSuggestions(knowledge: PortfolioKnowledge): string[] {
	const suggestions: string[] = [];

	suggestions.push("Quel est mon profil technique ?");
	suggestions.push("Quelle stack est-ce que j'utilise ?");

	if (searchProjects(knowledge, "ai").length > 0) {
		suggestions.push("Quels sont mes projets IA ?");
	}
	if (searchProjects(knowledge, "product").length > 0) {
		suggestions.push("Montre-moi mes projets SaaS");
	}
	if (searchProjects(knowledge, "data").length > 0) {
		suggestions.push("Quel projet démontre mes compétences Data ?");
	}

	// Add one data-driven technology question when possible.
	const tech = ["FastAPI", "Mistral AI", "React", "Machine Learning"].find(
		(t) => projectsUsingTechnology(knowledge, t).length > 0
	);
	if (tech && suggestions.length < 6) {
		suggestions.push(`Quels projets utilisent ${tech} ?`);
	}

	return suggestions.slice(0, 5);
}
