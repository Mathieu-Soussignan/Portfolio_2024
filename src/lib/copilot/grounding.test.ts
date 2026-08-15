import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCopilotContext } from "./context.ts";
import { buildPortfolioKnowledge } from "./knowledge.ts";
import type { WorkEntryLike } from "./knowledge.ts";
import { detectIntent } from "./intent.ts";
import { createHybridCopilotEngine, createMistralCopilotProvider } from "./provider.ts";
import { validateCopilotGeneration } from "./validation.ts";
import type { CopilotContext, MistralGeneration, PortfolioKnowledge, ProjectContextItem } from "./types.ts";

const work: WorkEntryLike[] = [
	{
		slug: "creatorcomptability",
		data: {
			title: "CreatorComptability V2",
			description:
				"Système d'exploitation financier & Copilot IA. Vue.js 3.5, FastAPI, Mistral AI (Pixtral 12B), conformité Factur-X 2026.",
			tags: ["SaaS", "FullStack", "Mistral AI", "Python", "Vue.js", "FastAPI"],
			publishDate: new Date("2026-07-20"),
		},
	},
	{
		slug: "predict-cars",
		data: {
			title: "Prédict Car",
			description:
				"Application de prédiction des prix des voitures d'occasion combinant React, FastAPI et des modèles de machine learning.",
			tags: ["IA", "React", "FastAPI", "Machine Learning"],
			publishDate: new Date("2025-04-02"),
		},
	},
	{
		slug: "mini-projet",
		data: {
			title: "Application Coûts Médicaux",
			description:
				"Application complète en trois volets pour gérer, prédire et orchestrer les charges médicales. Composée de deux API en FastAPI et d'une interface Streamlit, le tout déployé avec Docker Compose.",
			tags: ["Docker", "Machine Learning", "API REST"],
			publishDate: new Date("2024-03-28"),
		},
	},
];

const knowledge: PortfolioKnowledge = buildPortfolioKnowledge(work);

function contextFor(question: string): CopilotContext {
	return buildCopilotContext(knowledge, detectIntent(question, knowledge));
}

function generation(overrides: Partial<MistralGeneration> = {}): MistralGeneration {
	return { answer: "Je recommande CreatorComptability V2.", ...overrides };
}

function item(slug: string): ProjectContextItem {
	const project = knowledge.projects.find((p) => p.slug === slug);
	assert.ok(project, `project ${slug} exists`);
	return { slug: project.slug, title: project.title, description: project.description, tags: project.tags, url: project.url };
}

// ---------------------------------------------------------------------------
// Unsupported qualifiers must be rejected (no extrapolation)
// ---------------------------------------------------------------------------

test("Grounding : 'livré en production' sans preuve → rejet", () => {
	const context = contextFor("Quel projet devrais-je montrer à un recruteur qui cherche un AI Engineer ?");
	const result = validateCopilotGeneration(
		generation({ answer: "CreatorComptability V2 est livré en production et utilisé par de vrais clients." }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.match(result.reason ?? "", /production/);
});

test("Grounding : 'architecture scalable' sans preuve → rejet", () => {
	const context = contextFor("Qui est Mathieu ?");
	const result = validateCopilotGeneration(
		generation({ answer: "Son architecture scalable et robuste est idéale pour un CTO." }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.match(result.reason ?? "", /scalability/);
});

test("Grounding : 'expertise RAG' avec technologies voisines → rejet", () => {
	const context = contextFor("Qui est Mathieu ?");
	const result = validateCopilotGeneration(
		generation({ answer: "Ce projet démontre son expertise RAG grâce à Mistral AI." }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.match(result.reason ?? "", /expertise/);
});

test("Grounding : 'conformité Factur-X 2027' (version non documentée) → rejet", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({ answer: "CreatorComptability V2 assure une conformité Factur-X 2027 complète." }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.match(result.reason ?? "", /year/);
});

// ---------------------------------------------------------------------------
// Documented facts and natural reformulations must be allowed
// ---------------------------------------------------------------------------

test("Grounding : fait explicitement documenté ('conformité Factur-X 2026') → autorisé", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability V2 combine Vue.js, FastAPI et Mistral AI, avec une conformité Factur-X 2026.",
			referencedProjects: ["creatorcomptability"],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, true);
});

test("Grounding : reformulation naturelle d'une preuve → autorisé", () => {
	const context = contextFor("Quel projet utilise le Machine Learning ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "Prédict Car met en œuvre de l'apprentissage automatique pour estimer le prix des véhicules.",
			referencedProjects: ["predict-cars"],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, true);
});

test("Grounding : 'expertise Machine Learning' avec preuve EXACT_MATCH → autorisé", () => {
	const context = contextFor("Quel projet démontre le mieux mon expertise en Machine Learning ?");
	assert.equal(context.confidence, "EXACT_MATCH");
	const result = validateCopilotGeneration(
		generation({
			answer: "Prédict Car démontre le mieux son expertise en Machine Learning grâce à ses modèles entraînés.",
			referencedProjects: ["predict-cars"],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// Structured claims
// ---------------------------------------------------------------------------

test("Grounding : claim avec preuve valide → ok", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability V2 utilise FastAPI.",
			referencedProjects: ["creatorcomptability"],
			referencedTechnologies: ["FastAPI"],
			claims: [
				{ text: "CreatorComptability V2 utilise FastAPI.", evidenceIds: ["project.creatorcomptability.tag.5"], kind: "documented" },
			],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, true);
});

test("Grounding : claim citant un id de preuve inconnu → rejet", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability V2 utilise FastAPI.",
			claims: [
				{ text: "CreatorComptability V2 utilise FastAPI.", evidenceIds: ["project.ghost.tag.0"], kind: "documented" },
			],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.equal(result.reason, "unknown_evidence");
});

test("Grounding : claim avec kind invalide → rejet", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability V2 utilise FastAPI.",
			claims: [
				{ text: "CreatorComptability V2 utilise FastAPI.", evidenceIds: ["project.creatorcomptability.tag.5"], kind: "whatever" as never },
			],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.equal(result.reason, "invalid_claim");
});

// ---------------------------------------------------------------------------
// Technology resolution: descriptions/titles count as evidence
// ---------------------------------------------------------------------------

test("Technologie : 'Pixtral 12B' documenté dans la description → accepté", () => {
	const context = contextFor("Quel projet est CreatorComptability ?");
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability V2 utilise Mistral AI (Pixtral 12B).",
			referencedProjects: ["creatorcomptability"],
			referencedTechnologies: ["Pixtral 12B"],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, true);
});

test("Technologie : 'Apache Spark' absent du contexte → unknown_technology", () => {
	const context = contextFor("Qui est Mathieu ?");
	const result = validateCopilotGeneration(
		generation({ answer: "Un projet utilise Apache Spark.", referencedTechnologies: ["Apache Spark"] }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.equal(result.reason, "unknown_technology");
});

test("Technologie : 'Kubernetes' réellement absent → toujours rejeté", () => {
	const context = contextFor("Qui est Mathieu ?");
	const result = validateCopilotGeneration(
		generation({ answer: "Un projet utilise Kubernetes.", referencedTechnologies: ["Kubernetes"] }),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.equal(result.reason, "unknown_technology");
});

// ---------------------------------------------------------------------------
// End-to-end: the real pitch question with an overclaiming Mistral answer
// ---------------------------------------------------------------------------

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
		json: async () => body,
	} as unknown as Response;
}

function makeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
	return handler as unknown as typeof fetch;
}

test("Pitch réel : réponse Mistral sur-claimante → rejetée, fallback V1 sans qualificatif", async () => {
	const question =
		"J'ai 30 secondes avec un CTO qui recrute un AI Engineer. Donne-moi un pitch naturel, en 3 phrases maximum, pour présenter le meilleur projet de mon portfolio.";
	const badGeneration = {
		answer:
			"CreatorComptability V2 illustre son expertise en intégration de LLM, pipelines ETL et architectures robustes, livrées en production. Idéal pour un CTO cherchant des solutions IA scalables.",
		confidence: null,
		referencedProjects: ["creatorcomptability"],
		outOfScope: false,
	};

	const fetchImpl = makeFetch(async () => mockResponse(200, { ok: true, generation: badGeneration }));
	const provider = createMistralCopilotProvider({ knowledge, endpoint: "/api/copilot", fetchImpl });
	const engine = createHybridCopilotEngine(knowledge, { mistral: { provider } });

	const response = await engine.ask(question);
	assert.notEqual(response.generatedBy, "mistral");
	assert.ok(!/(production|scalab|expertise|déployé|deploye)/i.test(response.headline), response.headline);
	assert.match(response.headline, /CreatorComptability/);
});

test("Grounding : 'déployé' attribué au mauvais projet → rejet via la preuve citée", () => {
	// The context contains a project that IS documented as "déployé" (mini-projet),
	// but the claim cites creatorcomptability, which has no such evidence. The
	// per-claim check must reject even though the whole context would pass.
	const base = contextFor("Qui est Mathieu ?");
	const context: CopilotContext = {
		...base,
		projects: [item("creatorcomptability"), item("mini-projet")],
		evidence: [],
		confidence: null,
	};
	const result = validateCopilotGeneration(
		generation({
			answer: "CreatorComptability est déployé.",
			claims: [
				{ text: "CreatorComptability est déployé.", evidenceIds: ["project.creatorcomptability.title"], kind: "documented" },
			],
		}),
		knowledge,
		context,
		null
	);
	assert.equal(result.ok, false);
	assert.equal(result.reason, "unsupported_claim:deployment");
});
