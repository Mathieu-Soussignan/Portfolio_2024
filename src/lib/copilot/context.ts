/**
 * Context Builder.
 *
 * Produces the *minimal* set of portfolio facts a provider needs to answer a
 * question. It reuses the existing retrieval layer, so the same evidence that
 * grounds the V1 answer also grounds the LLM answer — nothing extra is sent,
 * and the LLM never sees the whole knowledge base at once.
 */

import { isStrictDomain } from "./domainData.ts";
import {
	findProjectBySlug,
	projectsUsingTechnology,
	rankProjects,
	rankProjectsByDomain,
	searchProjects,
} from "./retrieval.ts";
import type {
	ConfidenceLevel,
	CopilotContext,
	PortfolioKnowledge,
	ProjectContextItem,
	ProjectRecord,
	QueryIntent,
} from "./types.ts";

/** Maximum projects sent to a provider (keeps tokens and noise low). */
const MAX_PROJECTS = 6;

function toContextItem(project: ProjectRecord): ProjectContextItem {
	return {
		slug: project.slug,
		title: project.title,
		description: project.description,
		tags: project.tags,
		url: project.url,
	};
}

/** Select the projects relevant to an intent (mirrors the V1 retrieval). */
export function selectRelevantProjects(knowledge: PortfolioKnowledge, intent: QueryIntent): ProjectRecord[] {
	switch (intent.kind) {
		case "technology_lookup":
			return intent.entity ? projectsUsingTechnology(knowledge, intent.entity).slice(0, MAX_PROJECTS) : [];

		case "project_detail": {
			const project = findProjectBySlug(knowledge, intent.entity);
			return project ? [project] : [];
		}

		case "best_project":
			return rankProjects(knowledge, intent.dimension ?? "product").slice(0, MAX_PROJECTS).map((r) => r.project);

		case "project_list":
			return (intent.dimension ? searchProjects(knowledge, intent.dimension) : knowledge.projects).slice(0, MAX_PROJECTS);

		case "compare": {
			// Two named projects → the context is exactly those projects.
			if (intent.comparisonProjects.length >= 2) {
				return intent.comparisonProjects
					.map((slug) => findProjectBySlug(knowledge, slug))
					.filter((p): p is ProjectRecord => p !== null)
					.slice(0, MAX_PROJECTS);
			}
			const data = searchProjects(knowledge, "data");
			const ai = searchProjects(knowledge, "ai");
			return [...data, ...ai].slice(0, MAX_PROJECTS);
		}

		case "fit":
			return searchProjects(knowledge, "ai").slice(0, MAX_PROJECTS);

		default:
			return knowledge.projects.slice(0, 3);
	}
}

/**
 * Build the grounding context for a question. `confidence`/`evidence` carry the
 * deterministic retrieval ceiling so the validator can later reject an LLM
 * answer that overclaims.
 */
export function buildCopilotContext(knowledge: PortfolioKnowledge, intent: QueryIntent): CopilotContext {
	let evidence: string[] = [];
	let confidence: ConfidenceLevel | null = null;

	if (intent.requestedDomain && isStrictDomain(intent.requestedDomain)) {
		const top = rankProjectsByDomain(knowledge, intent.requestedDomain)[0];
		if (top) {
			evidence = top.evidence;
			confidence = top.level;
		}
	}

	return {
		profile: { ...knowledge.profile },
		skills: knowledge.skills.flatMap((group) => group.skills),
		experience: knowledge.experience.map((e) => ({
			period: e.period,
			title: e.title,
			company: e.company,
			description: e.description,
		})),
		projects: selectRelevantProjects(knowledge, intent).map(toContextItem),
		evidence,
		confidence,
		outOfScope: false,
	};
}
