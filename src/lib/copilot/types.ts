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
	 * Slugs of the projects explicitly named for comparison (two or more).
	 * Empty for every other intent.
	 */
	comparisonProjects: string[];
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
	/** Which provider produced this answer (transparency indicator). */
	generatedBy?: CopilotSource;
	/** Follow-up questions generated from the knowledge base. */
	suggestions: string[];
}

/** Which engine produced an answer (local deterministic or Mistral). */
export type CopilotSource = "local" | "mistral";

/** Public surface of the copilot engine (the "Copilot Controller"). */
export interface CopilotEngine {
	/**
	 * Answer a natural-language question using only the portfolio knowledge.
	 * The deterministic V1 engine resolves synchronously; the hybrid V2 engine
	 * may resolve asynchronously (Mistral call).
	 */
	ask(question: string): CopilotResponse | Promise<CopilotResponse>;
	/** Suggest questions, generated from the actual portfolio data. */
	suggest(): string[];
}

/** A project reduced to the fields needed to ground an LLM answer. */
export interface ProjectContextItem {
	slug: string;
	title: string;
	description: string;
	tags: string[];
	url: string;
}

/**
 * Grounding context passed to a provider: only the information relevant to the
 * question. This is the *only* data a provider may use to answer — the
 * knowledge base is the source of truth, never the model's priors.
 */
export interface CopilotContext {
	profile: {
		name: string;
		role: string;
		company: string;
		location: string;
		summary: string;
		training: string[];
	};
	skills: string[];
	experience: { period: string; title: string; company: string; description: string }[];
	projects: ProjectContextItem[];
	/** Explicit evidence terms retrieved for the question. */
	evidence: string[];
	/** Evidence-based confidence ceiling for the question. */
	confidence: ConfidenceLevel | null;
	/** True when the question is outside the portfolio scope. */
	outOfScope: boolean;
}

/** Everything a provider needs to answer a question, grounded in the knowledge. */
export interface CopilotGenerationRequest {
	question: string;
	intent: QueryIntent;
	context: CopilotContext;
	/** Evidence-based confidence ceiling from the deterministic V1 answer. */
	baseConfidence: ConfidenceLevel | null;
}

/**
 * How a claim relates to the grounding context:
 *  - "documented"   → restates a fact verbatim from the context;
 *  - "reformulation"→ natural rephrasing of a context fact (no added meaning);
 *  - "inference"    → synthesis / comparison / recommendation built from
 *                     several documented facts. It must not introduce a new
 *                     fact (technology, project, qualifier, version).
 */
export type ClaimKind = "documented" | "reformulation" | "inference";

/** A single factual assertion with pointers to the evidence atoms that support it. */
export interface EvidenceClaim {
	text: string;
	/** IDs of the evidence atoms (see the registry rendered in the prompt). */
	evidenceIds: string[];
	kind: ClaimKind;
}

/** Raw structured output produced by the Mistral provider (pre-validation). */
export interface MistralGeneration {
	answer: string;
	confidence?: ConfidenceLevel | null;
	/** Project slugs or exact titles referenced by the answer. */
	referencedProjects?: string[];
	/** Technologies referenced by the answer. */
	referencedTechnologies?: string[];
	/** Per-sentence grounding: each claim cites the evidence it relies on. */
	claims?: EvidenceClaim[];
	reasoningSummary?: string;
	outOfScope?: boolean;
}

/**
 * Provider abstraction: swaps the local deterministic engine for a grounded LLM
 * (or vice-versa) without touching the UI. Both produce a validated
 * `CopilotResponse`; a provider may throw to signal "use the fallback".
 */
export interface CopilotProvider {
	readonly name: CopilotSource;
	generate(request: CopilotGenerationRequest): Promise<CopilotResponse>;
}
