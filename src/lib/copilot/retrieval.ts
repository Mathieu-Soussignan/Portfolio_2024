/**
 * Knowledge retrieval layer.
 *
 * Finds relevant projects for a detected intent and ranks them with a small,
 * transparent scoring function:
 *
 *   dimension relevance + technical complexity + completeness + recency + architecture
 *
 * Everything is deterministic and derived from the portfolio data (tags,
 * descriptions, publish dates) — no external calls, no hidden weights.
 */

import { getDomain } from "./domainData.ts";
import {
	TECH_ALIASES,
	containsKeyword,
	normalize,
	projectDimensionKeywords,
} from "./intent.ts";
import type { ConfidenceLevel, Dimension, PortfolioKnowledge, ProjectRecord, RequestedDomain } from "./types.ts";

/** Normalized searchable text for a project. */
export function projectBlob(project: ProjectRecord): string {
	return normalize(`${project.title} ${project.description} ${project.tags.join(" ")}`);
}

/** Projects matching a given dimension (IA / Data / Product / FullStack). */
export function searchProjects(knowledge: PortfolioKnowledge, dimension: Dimension): ProjectRecord[] {
	const keywords = projectDimensionKeywords[dimension];
	return knowledge.projects.filter((p) => {
		const blob = projectBlob(p);
		return keywords.some((kw) => containsKeyword(blob, kw));
	});
}

export function findProjectBySlug(knowledge: PortfolioKnowledge, slug: string | null): ProjectRecord | null {
	if (!slug) return null;
	return knowledge.projects.find((p) => p.slug === slug) ?? null;
}

/** Result of assessing one project against a strict technical domain. */
export interface DomainAssessment {
	domain: RequestedDomain;
	label: string;
	level: ConfidenceLevel;
	/** Explicit evidence terms found (never a neighbouring technology). */
	evidence: string[];
	/** Neighbouring technologies found — context only, not proof. */
	context: string[];
}

/**
 * Assess whether a project demonstrates a domain using **explicit evidence
 * only**. Confidence tiers:
 *
 *   EXACT_MATCH      — an evidence term appears in the project's tags or title.
 *   HIGH_CONFIDENCE  — an evidence term appears in the project's description.
 *   PARTIAL_MATCH    — no evidence, only neighbouring technologies.
 *   NO_EVIDENCE      — nothing matches.
 *
 * Neighbouring techs (e.g. "Mistral AI" vs. "RAG", "IA" vs. "Computer
 * Vision") never count as evidence.
 */
export function assessProjectDomain(project: ProjectRecord, domainKey: RequestedDomain): DomainAssessment | null {
	const domain = getDomain(domainKey);
	if (!domain) return null;

	const title = normalize(project.title);
	const tags = project.tags.map(normalize).join(" ");
	const blob = projectBlob(project);

	const evidence: string[] = [];
	for (const kw of domain.evidence) {
		if (containsKeyword(title, kw) || containsKeyword(tags, kw) || containsKeyword(blob, kw)) {
			if (!evidence.includes(kw)) evidence.push(kw);
		}
	}

	const context: string[] = [];
	for (const kw of domain.context) {
		if (containsKeyword(blob, kw) && !evidence.includes(kw)) {
			if (!context.includes(kw)) context.push(kw);
		}
	}

	const inTagsOrTitle = domain.evidence.some(
		(kw) => containsKeyword(title, kw) || containsKeyword(tags, kw)
	);

	let level: ConfidenceLevel;
	if (inTagsOrTitle) level = "EXACT_MATCH";
	else if (evidence.length > 0) level = "HIGH_CONFIDENCE";
	else if (context.length > 0) level = "PARTIAL_MATCH";
	else level = "NO_EVIDENCE";

	return { domain: domain.key, label: domain.label, level, evidence, context };
}

/** A project ranked against a strict domain, with its evidence. */
export interface RankedDomainProject {
	project: ProjectRecord;
	level: ConfidenceLevel;
	evidence: string[];
	context: string[];
}

/**
 * Rank projects for a strict domain using evidence only. Projects without
 * explicit evidence are excluded — a recommendation is never built on a
 * neighbouring technology.
 */
export function rankProjectsByDomain(knowledge: PortfolioKnowledge, domainKey: RequestedDomain): RankedDomainProject[] {
	return knowledge.projects
		.map((project) => {
			const a = assessProjectDomain(project, domainKey);
			return { project, level: a?.level ?? ("NO_EVIDENCE" as ConfidenceLevel), evidence: a?.evidence ?? [], context: a?.context ?? [] };
		})
		.filter((r) => r.level === "EXACT_MATCH" || r.level === "HIGH_CONFIDENCE")
		.sort((a, b) => {
			const levelRank = (l: ConfidenceLevel) => (l === "EXACT_MATCH" ? 1 : 0);
			if (levelRank(b.level) !== levelRank(a.level)) return levelRank(b.level) - levelRank(a.level);
			if (b.evidence.length !== a.evidence.length) return b.evidence.length - a.evidence.length;
			// Tie-break: prefer the more recent project, then the richer description.
			if (b.project.publishDate !== a.project.publishDate) {
				return b.project.publishDate.localeCompare(a.project.publishDate);
			}
			return b.project.description.length - a.project.description.length;
		});
}

/** All assessments for a domain (for nuanced / partial answers). */
export function assessAllProjects(knowledge: PortfolioKnowledge, domainKey: RequestedDomain): (DomainAssessment & { project: ProjectRecord })[] {
	return knowledge.projects
		.map((project) => {
			const assessment = assessProjectDomain(project, domainKey);
			return assessment ? { ...assessment, project } : null;
		})
		.filter((a): a is NonNullable<typeof a> => a !== null);
}

/** Aliases (incl. canonical name) that describe a technology. */
function aliasesFor(canonical: string): string[] {
	const entry = TECH_ALIASES.find((t) => t.canonical === canonical);
	return entry ? entry.aliases : [normalize(canonical)];
}

/** True when a project uses a given technology (matched via aliases). */
export function projectUsesTechnology(project: ProjectRecord, tech: string): boolean {
	const blob = projectBlob(project);
	const tags = project.tags.map(normalize);
	return aliasesFor(tech).some((alias) => {
		const al = alias.trim();
		if (!al) return false;
		if (tags.some((t) => t === al)) return true;
		return containsKeyword(blob, al);
	});
}

/** Projects that use a given technology. */
export function projectsUsingTechnology(knowledge: PortfolioKnowledge, tech: string): ProjectRecord[] {
	return knowledge.projects.filter((p) => projectUsesTechnology(p, tech));
}

interface DimensionSignal {
	key: string;
	weight: number;
	reason?: string;
}

const DIMENSION_SIGNALS: Record<Dimension, DimensionSignal[]> = {
	ai: [
		{ key: "mistral ai", weight: 5, reason: "IA générative avec Mistral AI" },
		{ key: "machine learning", weight: 4, reason: "Modèle Machine Learning entraîné" },
		{ key: "llm", weight: 4, reason: "Intégration de modèles de langage (LLM)" },
		{ key: "nlp", weight: 3, reason: "Traitement du langage naturel (NLP)" },
		{ key: "ia", weight: 3, reason: "Intelligence artificielle appliquée" },
		{ key: "copilot", weight: 3, reason: "Fonctionnalité Copilot IA intégrée" },
		{ key: "ollama", weight: 2, reason: "LLM local via Ollama" },
		{ key: "pytorch", weight: 2, reason: "Deep Learning avec PyTorch" },
		{ key: "scikit learn", weight: 2, reason: "Machine Learning avec Scikit-Learn" },
		{ key: "generative", weight: 2, reason: "IA générative appliquée" },
		{ key: "ocr", weight: 2, reason: "Extraction de documents par IA (OCR)" },
		{ key: "pixtral", weight: 2, reason: "Modèle multimodal (Pixtral)" },
	],
	data: [
		{ key: "data visualization", weight: 5, reason: "Visualisation de données" },
		{ key: "pipeline", weight: 4, reason: "Pipeline de données industrialisé" },
		{ key: "etl", weight: 4, reason: "Pipeline ETL" },
		{ key: "pandas", weight: 3, reason: "Manipulation de données avec Pandas" },
		{ key: "sql", weight: 3, reason: "Base de données SQL" },
		{ key: "dashboard", weight: 3, reason: "Dashboard interactif" },
		{ key: "api rest", weight: 2, reason: "API REST de données" },
		{ key: "mlflow", weight: 2, reason: "Suivi d'expériences ML (MLflow)" },
		{ key: "streamlit", weight: 2, reason: "Interface data avec Streamlit" },
		{ key: "matplotlib", weight: 2, reason: "Visualisations Matplotlib" },
		{ key: "data engineering", weight: 4, reason: "Data Engineering de bout en bout" },
	],
	product: [
		{ key: "saas", weight: 6, reason: "Produit SaaS complet et abouti" },
		{ key: "fullstack", weight: 4, reason: "Produit FullStack de bout en bout" },
		{ key: "b2b", weight: 3, reason: "Cible B2B / utilisateurs métier" },
		{ key: "cockpit", weight: 2, reason: "Produit orienté métier (cockpit)" },
		{ key: "client", weight: 2, reason: "Conçu pour un besoin utilisateur réel" },
		{ key: "produit", weight: 2, reason: "Vision produit explicite" },
	],
	fullstack: [
		{ key: "fullstack", weight: 6, reason: "Architecture FullStack complète" },
		{ key: "fastapi", weight: 4, reason: "Backend FastAPI" },
		{ key: "next js", weight: 4, reason: "Framework fullstack Next.js" },
		{ key: "react", weight: 3, reason: "Frontend React" },
		{ key: "vue js", weight: 3, reason: "Frontend Vue.js" },
		{ key: "python", weight: 2, reason: "Backend Python" },
		{ key: "docker", weight: 2, reason: "Déploiement avec Docker" },
	],
};

const BACKEND_KEYWORDS = ["fastapi", "flask", "php", "next js", "node js", "sqlalchemy", "sqlite", "mysql", "postgresql", "supabase", "api rest", "streamlit"];
const FRONTEND_KEYWORDS = ["react", "vue", "next js", "vite", "tailwind", "html", "css", "streamlit", "material ui", "web design", "frontend", "front end", "front-end"];

function hasBackend(project: ProjectRecord): boolean {
	const tags = project.tags.map(normalize);
	const blob = projectBlob(project);
	return BACKEND_KEYWORDS.some((kw) => tags.includes(kw) || containsKeyword(blob, kw));
}

function hasFrontend(project: ProjectRecord): boolean {
	const tags = project.tags.map(normalize);
	const blob = projectBlob(project);
	return FRONTEND_KEYWORDS.some((kw) => tags.includes(kw) || containsKeyword(blob, kw));
}

export interface RankedProject {
	project: ProjectRecord;
	score: number;
	reasons: string[];
}

/** Rank projects for a dimension with an explainable score. */
export function rankProjects(knowledge: PortfolioKnowledge, dimension: Dimension, now: number = Date.now()): RankedProject[] {
	const signals = DIMENSION_SIGNALS[dimension];
	const oneYearMs = 365 * 24 * 60 * 60 * 1000;

	return knowledge.projects
		.map((project) => {
			const blob = projectBlob(project);
			const tags = project.tags.map(normalize);
			let score = 0;
			const reasons: string[] = [];

			for (const signal of signals) {
				const matched = tags.includes(signal.key) || containsKeyword(blob, signal.key);
				if (matched) {
					score += signal.weight;
					if (signal.reason && !reasons.includes(signal.reason)) reasons.push(signal.reason);
				}
			}

			// Technical complexity: breadth of the stack.
			if (project.tags.length >= 6) {
				score += 2;
				reasons.push(`Stack complète (${project.tags.length} technologies)`);
			} else if (project.tags.length >= 4) {
				score += 1;
			}

			// Completeness: how well documented / described the project is.
			if (project.description.length >= 350) {
				score += 3;
				reasons.push("Projet documenté et abouti");
			} else if (project.description.length >= 180) {
				score += 2;
			}

			// Recency.
			const published = Date.parse(project.publishDate);
			if (!Number.isNaN(published) && now - published < oneYearMs && now - published >= 0) {
				score += 1;
				reasons.push("Projet récent");
			}

			// Architecture relevance: a real backend and frontend.
			if (hasBackend(project) && hasFrontend(project)) {
				score += 3;
				reasons.push("Architecture FullStack (backend + frontend)");
			}

			return { project, score, reasons };
		})
		.sort((a, b) => b.score - a.score || b.project.publishDate.localeCompare(a.project.publishDate));
}
