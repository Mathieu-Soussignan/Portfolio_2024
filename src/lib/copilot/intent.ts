/**
 * Intent detection layer.
 *
 * Deterministic, rule-based understanding of a visitor's question:
 *   1. normalize the text (lowercase, strip accents/punctuation),
 *   2. detect the intent,
 *   3. extract relevant entities (technology or project).
 *
 * This is deliberately transparent and dependency-free so it can later be
 * replaced by an embedding/LLM classifier behind the same `QueryIntent` type.
 */

import { DOMAINS } from "./domainData.ts";
import type { Dimension, IntentKind, PortfolioKnowledge, QueryIntent, RequestedDomain } from "./types.ts";

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[’']/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Tokens of a normalized string. */
export function tokenize(text: string): string[] {
	return text.split(" ").filter((t) => t.length > 0);
}

/**
 * Keyword match against a normalized blob.
 * Phrases are matched as substrings; short tokens (<=3 chars, e.g. "ia", "sql")
 * must match whole tokens to avoid false positives ("social", "sqlite").
 */
export function containsKeyword(blob: string, keyword: string): boolean {
	const kw = keyword.trim();
	if (!kw) return false;
	if (kw.includes(" ")) return blob.includes(kw);
	if (kw.length <= 3) return tokenize(blob).includes(kw);
	return blob.includes(kw);
}

/** Map of canonical technology names → recognized aliases. */
export const TECH_ALIASES: { canonical: string; aliases: string[] }[] = [
	{ canonical: "Mistral AI", aliases: ["mistral", "mistral ai", "pixtral"] },
	{ canonical: "FastAPI", aliases: ["fastapi", "fast api"] },
	{ canonical: "Python", aliases: ["python"] },
	{ canonical: "React", aliases: ["react", "react js", "reactjs"] },
	{ canonical: "Vue.js", aliases: ["vue", "vue js", "vuejs"] },
	{ canonical: "Next.js", aliases: ["next", "next js", "nextjs", "next 15"] },
	{ canonical: "Flask", aliases: ["flask"] },
	{ canonical: "Machine Learning", aliases: ["machine learning"] },
	{ canonical: "NLP", aliases: ["nlp", "traitement du langage", "traitement du langage naturel"] },
	{ canonical: "Ollama", aliases: ["ollama", "llama"] },
	{ canonical: "PyTorch", aliases: ["pytorch", "torch"] },
	{ canonical: "Scikit-Learn", aliases: ["scikit", "scikit learn", "sklearn"] },
	{ canonical: "Pandas", aliases: ["pandas"] },
	{ canonical: "Docker", aliases: ["docker"] },
	{ canonical: "TypeScript", aliases: ["typescript"] },
	{ canonical: "JavaScript", aliases: ["javascript"] },
	{ canonical: "SQL", aliases: ["sql", "postgresql", "postgres", "mysql", "sqlite"] },
	{ canonical: "Tailwind CSS", aliases: ["tailwind", "tailwind css"] },
	{ canonical: "Streamlit", aliases: ["streamlit"] },
	{ canonical: "Astro", aliases: ["astro"] },
	{ canonical: "PHP", aliases: ["php"] },
];

/**
 * Keywords used to detect the *dimension* of a question ("IA", "Data", …).
 * Also used to filter projects in the retrieval layer.
 */
export const projectDimensionKeywords: Record<Dimension, string[]> = {
	ai: [
		"ia",
		"ai",
		"machine learning",
		"nlp",
		"mistral",
		"pixtral",
		"ollama",
		"llm",
		"pytorch",
		"scikit",
		"sumy",
		"nltk",
		"llama",
		"generative",
		"generation",
		"copilot",
		"deep learning",
	],
	data: [
		"data engineering",
		"data engineer",
		"data visualization",
		"visualisation",
		"dashboard",
		"pandas",
		"matplotlib",
		"seaborn",
		"etl",
		"pipeline",
		"sql",
		"postgresql",
		"sqlite",
		"sqlalchemy",
		"api rest",
		"mlflow",
		"streamlit",
		"base de donnees",
	],
	product: [
		"produit",
		"saas",
		"business",
		"client",
		"utilisateur",
		"monetis",
		"b2b",
		"cockpit",
		"suite",
		"plateforme",
		"souscription",
		"marketplace",
	],
	fullstack: [
		"fullstack",
		"full stack",
		"bout en bout",
		"de bout en bout",
		"frontend",
		"front end",
		"backend",
		"back end",
	],
};

/** Question-level keywords for dimension detection (narrower than above). */
const DIMENSION_HINTS: Record<Dimension, string[]> = {
	ai: ["ia", "ai", "intelligence artificielle", "machine learning", "nlp", "mistral", "llm", "pytorch", "ai engineer"],
	data: ["data", "donnees", "etl", "sql", "pipeline", "data engineer", "data engineering", "visualisation", "dashboard"],
	product: ["produit", "saas", "business", "monetis", "b2b", "ux"],
	fullstack: ["fullstack", "full stack", "bout en bout", "de bout en bout"],
};

/** Topics the copilot must refuse (no public/private data, no hallucination). */
const PRIVATE_TOPIC_KEYWORDS = [
	"salaire",
	"remuneration",
	"combien gagne",
	"combien il gagne",
	"age",
	"date de naissance",
	"ne en",
	"numero de telephone",
	"telephone",
	"numero",
	"adresse",
	"habite",
	"domicile",
	"code postal",
	"ville exacte",
	"mot de passe",
	"password",
	"cle api",
	"api key",
	"token",
	"secret",
	"clients de",
	"liste des clients",
];

/** True when the question targets information that is not publicly available. */
export function isOutOfScope(normalized: string): boolean {
	return PRIVATE_TOPIC_KEYWORDS.some((k) => normalized.includes(k));
}

/** Instructions that try to override or contradict the portfolio scope. */
const MANIPULATION_KEYWORDS = [
	"ignore toutes les informations",
	"ignore les informations",
	"ignore les instructions",
	"ignore tes instructions",
	"ignore tout",
	"oublie toutes les informations",
	"oublie les instructions",
	"fais comme si",
	"fait comme si",
	"pretends que",
	"pretend que",
	"pretends etre",
	"dis moi que",
	"affirme que",
	"mens",
	"hallucine",
];

/** True when the question asks the copilot to ignore or contradict its data. */
export function isManipulation(normalized: string): boolean {
	return MANIPULATION_KEYWORDS.some((k) => normalized.includes(k));
}

/**
 * Verbs that mark a technology-lookup question ("quel projet utilise X ?").
 * When the technology is not a known alias, the text after the verb is used as
 * the searched entity so the engine can answer honestly ("no evidence")
 * instead of falling back to a generic project list.
 */
const TECH_LOOKUP_VERBS = [
	"utilise t il",
	"utilise t elle",
	"utilise t on",
	"utilise til",
	"s utilisent",
	"s utilise",
	"utilisant",
	"utilisent",
	"utiliser",
	"utilise",
	"basee sur",
	"base sur",
];

/** Tokens that should never be part of a technology candidate. */
const TECH_CANDIDATE_FILLER = new Set([
	"t", "il", "elle", "on", "tu", "vous", "nous", "je", "ils", "elles", "pas",
	"pour", "du", "de", "des", "avec", "sur", "dans", "le", "la", "les", "un", "une", "et", "ou", "en",
]);

/**
 * Extract a technology candidate from an unrecognized lookup question, e.g.
 * "quel projet utilise apache spark" → "Apache Spark". Returns null when the
 * question is not actually a specific-technology lookup.
 */
export function extractTechCandidate(normalized: string): string | null {
	let best: { verb: string; idx: number } | null = null;
	for (const verb of TECH_LOOKUP_VERBS) {
		const idx = normalized.lastIndexOf(verb);
		if (idx >= 0 && (!best || idx > best.idx)) best = { verb, idx };
	}
	if (!best) return null;

	const tokens = normalized
		.slice(best.idx + best.verb.length)
		.split(" ")
		.filter((t) => t.length > 0);

	while (tokens.length > 0 && TECH_CANDIDATE_FILLER.has(tokens[0])) tokens.shift();
	while (tokens.length > 0 && TECH_CANDIDATE_FILLER.has(tokens[tokens.length - 1])) tokens.pop();

	if (tokens.length === 0 || tokens.length > 6) return null;

	return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ");
}

function hasAny(haystack: string, needles: string[]): boolean {
	return needles.some((n) => haystack.includes(n));
}

function hintScore(haystack: string, needles: string[]): number {
	return needles.filter((n) => containsKeyword(haystack, n)).length;
}

/** Extract a canonical technology entity from a normalized question. */
export function extractTechEntity(normalized: string): string | null {
	let best: { canonical: string; length: number } | null = null;
	for (const entry of TECH_ALIASES) {
		for (const alias of entry.aliases) {
			const al = alias.trim();
			if (!al || !normalized.includes(al)) continue;
			// Prefer the most specific (longest) alias match.
			if (!best || al.length > best.length) {
				best = { canonical: entry.canonical, length: al.length };
			}
		}
	}
	return best ? best.canonical : null;
}

/** Detect which dimension (ai/data/product/fullstack) a question targets. */
export function detectDimension(normalized: string): Dimension | null {
	let best: Dimension | null = null;
	let bestScore = 0;
	for (const dim of Object.keys(DIMENSION_HINTS) as Dimension[]) {
		const score = hintScore(normalized, DIMENSION_HINTS[dim]);
		if (score > bestScore) {
			bestScore = score;
			best = dim;
		}
	}
	return best;
}

/**
 * Detect which technical domain the question explicitly names (RAG, Computer
 * Vision, ML, LLM, NLP, Agents, …). Most-specific domains are checked first.
 */
export function detectRequestedDomain(normalized: string): RequestedDomain | null {
	for (const domain of DOMAINS) {
		if (domain.aliases.some((a) => containsKeyword(normalized, a))) {
			return domain.key;
		}
	}
	return null;
}

/**
 * Find the project a question is referring to (by slug, full title, or a
 * meaningful overlap of title tokens).
 */
export function extractProjectEntity(normalized: string, knowledge: PortfolioKnowledge): string | null {
	let bestSlug: string | null = null;
	let bestScore = 0;

	for (const project of knowledge.projects) {
		const title = normalize(project.title);
		const slug = project.slug.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

		let score = 0;
		if (normalized.includes(slug)) score = 100;
		else if (normalized.includes(title)) score = 90;

		if (score === 0) {
			const qTokens = new Set(tokenize(normalized).filter((t) => t.length >= 4));
			const pTokens = new Set(tokenize(`${title} ${slug}`).filter((t) => t.length >= 4));
			pTokens.forEach((t) => {
				if (qTokens.has(t)) score++;
			});
		}

		if (score > bestScore) {
			bestScore = score;
			bestSlug = project.slug;
		}
	}

	return bestScore >= 2 ? bestSlug : null;
}

export function detectIntent(question: string, knowledge: PortfolioKnowledge): QueryIntent {
	const raw = question.trim();
	const normalized = normalize(raw);
	const tech = extractTechEntity(normalized);
	const project = extractProjectEntity(normalized, knowledge);
	const dimension = detectDimension(normalized);
	const requestedDomain = detectRequestedDomain(normalized);

	const base = { raw, normalized, requestedDomain };

	// 1. Greeting (short and starting with a greeting word).
	if (/^(bonjour|bonsoir|salut|hello|hi|coucou|hey)\b/.test(normalized) && normalized.length < 30) {
		return { ...base, kind: "greeting" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 2. Help / capabilities.
	if (hasAny(normalized, ["aide", "help", "commandes disponibles", "que sais tu", "que peux tu faire", "que peux-tu faire", "comment ca marche", "comment fonctionne", "que fais tu"])) {
		return { ...base, kind: "help" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 3. Contact.
	if (hasAny(normalized, ["contact", "email", "mail", "linkedin", "github", "joindre", "coordonnees", "reseaux"])) {
		return { ...base, kind: "contact" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 4. Project recommendation — "which project best demonstrates X?".
	// Requires both a project mention and a recommendation verb so that
	// "Quel projet utilise FastAPI ?" (lookup) is not misread as a recommendation.
	const mentionsProject = hasAny(normalized, ["projet", "projets"]);
	const recommendationVerb = hasAny(normalized, [
		"meilleur",
		"demontre",
		"montre",
		"montrer",
		"recommande",
		"recommander",
		"recommanderais",
		"le plus",
		"plus avance",
		"plus representatif",
		"expert",
		"expertise",
		"specialise",
		"specialiste",
		"representatif",
		"pertinent",
		"devrais",
		"conseillerais",
		"ideal",
		"met le plus en valeur",
		"illustre le mieux",
	]);
	if (mentionsProject && recommendationVerb) {
		return { ...base, kind: "best_project" as IntentKind, entity: null, entityType: null, dimension: dimension ?? "product" };
	}

	// 5. Career pitch — "why does his profile fit an AI Engineer role?".
	if (hasAny(normalized, ["pourquoi son profil", "pourquoi ton profil", "pourquoi ce profil", "profil correspond", "correspondrait", "candidature", "embaucher", "poste de", "poste d ai", "poste d ai engineer", "poste d ingenieur", "pourquoi il serait", "pourquoi je devrais", "pourquoi l embaucher"])) {
		return { ...base, kind: "fit" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 6. Comparison ("Data vs IA").
	if (hasAny(normalized, ["difference", "differe", "compar", "distinguer", "versus", " entre "])) {
		return { ...base, kind: "compare" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 7. Technology lookup — "uses X?", "projects using X".
	const asksAboutTech = hasAny(normalized, ["utilise", "utilisent", "utiliser", "maitrise", "connait", "quel projet", "quels projets", "avec quel", "base sur", "basé sur"]);
	if (tech && asksAboutTech) {
		return { ...base, kind: "technology_lookup" as IntentKind, entity: tech, entityType: "technology", dimension: dimension };
	}
	// Unknown technology named explicitly (e.g. "Apache Spark") → treat it as a
	// technology lookup so the response stays honest instead of listing everything.
	if (asksAboutTech) {
		const candidate = extractTechCandidate(normalized);
		if (candidate) {
			return { ...base, kind: "technology_lookup" as IntentKind, entity: candidate, entityType: "technology", dimension: dimension };
		}
	}

	// 8. Project detail — a project was explicitly named.
	if (project) {
		return { ...base, kind: "project_detail" as IntentKind, entity: project, entityType: "project", dimension: null };
	}

	// 9. Project list ("projets IA / SaaS / Data").
	if (hasAny(normalized, ["projet", "projets", "realisation", "realisations", "portfolio", "showcase", "applications", "demos"])) {
		return { ...base, kind: "project_list" as IntentKind, entity: null, entityType: null, dimension: dimension };
	}

	// 10. Experience / career.
	if (hasAny(normalized, ["experience", "carriere", "parcours", "entreprise", "travaille", "travail", "poste", "formation", "etudes", "diplome", "alternance", "cdi", "reconversion"])) {
		return { ...base, kind: "experience" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 11. Profile / identity.
	if (hasAny(normalized, ["qui est", "qui es tu", "presente", "metier", "role", "bio", "profil", "qui est il", "c est qui", "profession"])) {
		return { ...base, kind: "profile" as IntentKind, entity: null, entityType: null, dimension: null };
	}

	// 12. Skills / stack.
	if (hasAny(normalized, ["competence", "competences", "skills", "stack", "technologie", "technologies", "technos", "outils", "langages", "maitrise", "sait il", "sait elle", "tech"])) {
		return { ...base, kind: "skills" as IntentKind, entity: null, entityType: null, dimension: dimension };
	}

	return { ...base, kind: "unknown" as IntentKind, entity: null, entityType: null, dimension: null };
}
