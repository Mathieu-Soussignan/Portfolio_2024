/**
 * Core types for the AI Portfolio Copilot.
 *
 * These interfaces form the contract between the layers of the pipeline:
 *
 *   UI → Copilot Controller → Intent Detection → Knowledge Retrieval → Response Generation
 *
 * Keeping them environment-agnostic (no DOM, no Node, no Astro imports) means the
 * engine can run in the browser today and be swapped for an LLM/RAG engine later
 * without touching the UI.
 */

/** What the user is trying to do. */
export type IntentKind =
	| "greeting"
	| "profile"
	| "experience"
	| "skills"
	| "technology_lookup"
	| "project_list"
	| "project_detail"
	| "best_project"
	| "fit"
	| "compare"
	| "contact"
	| "help"
	| "unknown";

/** Scoring dimensions used by "which project best demonstrates X?" questions. */
export type Dimension = "ai" | "data" | "product" | "fullstack";

/**
 * Confidence of a domain-level recommendation, from explicit evidence down to
 * an honest refusal.
 */
export type ConfidenceLevel = "EXACT_MATCH" | "HIGH_CONFIDENCE" | "PARTIAL_MATCH" | "NO_EVIDENCE";

/**
 * Technical domain a question can target, kept distinct from the intent.
 * Strict domains (RAG, Computer Vision, ML, LLM, NLP, Agents) require explicit
 * evidence in the portfolio before a project can be recommended.
 */
export type RequestedDomain =
	| "rag"
	| "computer_vision"
	| "machine_learning"
	| "llm"
	| "nlp"
	| "agents"
	| "ai"
	| "data_engineering"
	| "frontend"
	| "backend"
	| "saas"
	| "fullstack";

/** A project as exposed to the copilot. Derived from the `work` content collection. */
export interface ProjectRecord {
	slug: string;
	title: string;
	description: string;
	tags: string[];
	/** Absolute site path, e.g. `/work/creatorcomptability/`. */
	url: string;
	/** ISO-8601 date string (used for recency scoring). */
	publishDate: string;
}

export interface ExperienceItem {
	period: string;
	title: string;
	company: string;
	description: string;
	tags: string[];
}

export interface SkillGroup {
	category: string;
	skills: string[];
}

export interface PortfolioKnowledge {
	profile: {
		name: string;
		role: string;
		company: string;
		location: string;
		summary: string;
		training: string[];
	};
	/** Short architecture / positioning statement (the "vision 360°"). */
	positioning: string;
	experience: ExperienceItem[];
	skills: SkillGroup[];
	projects: ProjectRecord[];
	contact: {
		email: string;
		linkedin: string;
		github: string;
	};
}

/** Result of intent detection: the recognized intent plus any extracted entity. */
export interface QueryIntent {
	kind: IntentKind;
	/** Canonical technology name, project slug/title, or null. */
	entity: string | null;
	entityType: "technology" | "project" | "dimension" | null;
	/** Set when the question asks to rank projects along a dimension. */
	dimension: Dimension | null;
	/**
	 * Technical domain explicitly named by the question (e.g. "RAG",
	 * "Computer Vision"). Kept separate from the intent and from `dimension`.
	 */
	requestedDomain: RequestedDomain | null;
	/** Original question as typed by the visitor. */
	raw: string;
	/** Normalized (lowercased, accent-stripped) question used for matching. */
	normalized: string;
}

/** A project referenced by an answer, navigable straight from the terminal. */
export interface ProjectReference {
	slug: string;
	title: string;
	url: string;
	tags: string[];
	/** Why this project was surfaced (scoring rationale). */
	reason?: string;
}

export type ResponseKind = "known" | "partial" | "unknown";

export interface ActionLink {
	label: string;
	href: string;
	kind: "project" | "external" | "mailto" | "internal";
}

export interface CopilotResponse {
	question: string;
	intent: QueryIntent;
	/** Confidence tier: full answer, partial answer, or honest refusal. */
	kind: ResponseKind;
	/** Main answer text. */
	headline: string;
	/** Supporting bullets (e.g. "Pourquoi ?" rationale). */
	bullets: string[];
	projects: ProjectReference[];
	links: ActionLink[];
	/** Confidence tier for domain-level recommendations. */
	confidence?: ConfidenceLevel;
	/** Explicit evidence terms that grounded the answer (if any). */
	evidence?: string[];
	/** Human-readable transparency notes about where the answer comes from. */
	sources: string[];
	/** Follow-up questions generated from the knowledge base. */
	suggestions: string[];
}

/** Public surface of the local response engine (the "Copilot Controller"). */
export interface CopilotEngine {
	/** Answer a natural-language question using only the portfolio knowledge. */
	ask(question: string): CopilotResponse;
	/** Suggest questions, generated from the actual portfolio data. */
	suggest(): string[];
}
