/**
 * Domain taxonomy for the copilot.
 *
 * A "domain" is the technical field a visitor asks about (RAG, Computer Vision,
 * Machine Learning, …). It is intentionally kept separate from the *intent*
 * (recommendation vs. lookup vs. pitch): a recommendation question carries a
 * `requestedDomain`, and a project can only be recommended for a strict domain
 * when the portfolio contains **explicit evidence** for it.
 *
 * Two families:
 *  - `strict` domains require explicit evidence (`evidence` keywords). A
 *    neighbouring technology (`context`) is context only — never proof.
 *  - composite domains (IA, Data Engineering, Frontend, Backend, SaaS,
 *    FullStack) are broad by nature and may use multi-criteria scoring.
 */

import type { RequestedDomain } from "./types.ts";

export interface DomainDefinition {
	key: RequestedDomain;
	/** Human-readable name, e.g. "RAG", "Computer Vision". */
	label: string;
	/** Terms a visitor would type to target this domain. */
	aliases: string[];
	/** Explicit evidence terms — matching one is real evidence. */
	evidence: string[];
	/** Neighbouring technologies — context only, never proof. */
	context: string[];
	/** True when a recommendation requires explicit evidence. */
	strict: boolean;
}

/** Ordered most-specific first so detection prefers precise domains. */
export const DOMAINS: DomainDefinition[] = [
	{
		key: "rag",
		label: "RAG",
		aliases: [
			"rag",
			"retrieval augmented generation",
			"retrieval",
			"recherche semantique",
			"vector database",
			"vector db",
			"vector search",
			"embeddings",
			"embedding",
			"base vectorielle",
			"vector store",
		],
		evidence: [
			"rag",
			"retrieval augmented generation",
			"retrieval",
			"embedding",
			"embeddings",
			"vector database",
			"vector db",
			"vector store",
			"vector search",
			"base vectorielle",
			"recherche semantique",
			"semantic search",
			"pinecone",
			"chroma",
			"faiss",
			"langchain",
			"llamaindex",
			"llama index",
		],
		context: ["llm", "mistral", "pixtral", "ollama", "groq", "ia", "ai", "nlp", "copilot"],
		strict: true,
	},
	{
		key: "computer_vision",
		label: "Computer Vision",
		aliases: [
			"computer vision",
			"vision par ordinateur",
			"vision artificielle",
			"traitement d image",
			"traitement d images",
			"reconnaissance d image",
			"detection d objet",
			"object detection",
		],
		evidence: [
			"computer vision",
			"vision par ordinateur",
			"vision artificielle",
			"image classification",
			"classification d image",
			"classification d images",
			"object detection",
			"detection d objet",
			"detection d objets",
			"segmentation",
			"reconnaissance d image",
			"reconnaissance faciale",
			"cnn",
			"reseau de neurones convolutif",
			"reseau de neurones convolutionnel",
			"yolo",
			"opencv",
			"traitement d image",
			"traitement d images",
			"torchvision",
		],
		context: ["ia", "ai", "ocr", "multimodal", "pixtral", "mistral"],
		strict: true,
	},
	{
		key: "machine_learning",
		label: "Machine Learning",
		aliases: ["machine learning", "apprentissage automatique", "ml"],
		evidence: [
			"machine learning",
			"apprentissage automatique",
			"ml",
			"random forest",
			"regression",
			"regression logistique",
			"regression lineaire",
			"xgboost",
			"catboost",
			"scikit",
			"sklearn",
			"scikit learn",
			"rmse",
			"classification",
			"gradient boosting",
		],
		context: ["ia", "ai", "nlp", "llm", "pytorch", "deep learning"],
		strict: true,
	},
	{
		key: "llm",
		label: "LLM",
		aliases: ["llm", "large language model", "modele de langage"],
		evidence: [
			"llm",
			"large language model",
			"modele de langage",
			"mistral",
			"pixtral",
			"llama",
			"ollama",
			"groq",
			"openai",
			"gpt",
		],
		context: ["ia", "ai", "nlp", "copilot"],
		strict: true,
	},
	{
		key: "nlp",
		label: "NLP",
		aliases: ["nlp", "traitement du langage", "langage naturel", "text mining"],
		evidence: [
			"nlp",
			"traitement du langage",
			"traitement du langage naturel",
			"langage naturel",
			"sumy",
			"nltk",
			"textrank",
			"lexrank",
			"lsa",
			"resume",
			"resumeur",
			"resume de texte",
			"tokenisation",
			"tokenizing",
			"text mining",
		],
		context: ["ia", "ai", "llm", "mistral"],
		strict: true,
	},
	{
		key: "agents",
		label: "Agents",
		aliases: ["agent", "agents", "multi agent", "agentique", "tool calling", "function calling"],
		evidence: ["agent", "agents", "multi agent", "agentique", "tool calling", "function calling"],
		context: ["copilot", "automatisation", "automatise", "autonome", "ia", "ai", "llm"],
		strict: true,
	},
	{
		key: "ai",
		label: "IA",
		aliases: ["ia", "ai", "intelligence artificielle", "ai engineer"],
		evidence: [],
		context: [],
		strict: false,
	},
	{
		key: "data_engineering",
		label: "Data Engineering",
		aliases: ["data engineering", "data engineer", "data", "donnees", "etl", "pipeline", "sql"],
		evidence: [],
		context: [],
		strict: false,
	},
	{
		key: "frontend",
		label: "Frontend",
		aliases: ["frontend", "front end", "front-end", "front"],
		evidence: [],
		context: [],
		strict: false,
	},
	{
		key: "backend",
		label: "Backend",
		aliases: ["backend", "back end", "back-end", "api"],
		evidence: [],
		context: [],
		strict: false,
	},
	{
		key: "saas",
		label: "SaaS",
		aliases: ["saas", "b2b", "souscription", "subscription"],
		evidence: [],
		context: [],
		strict: false,
	},
	{
		key: "fullstack",
		label: "FullStack",
		aliases: ["fullstack", "full stack", "bout en bout", "de bout en bout"],
		evidence: [],
		context: [],
		strict: false,
	},
];

const STRICT_DOMAINS: ReadonlySet<RequestedDomain> = new Set(
	DOMAINS.filter((d) => d.strict).map((d) => d.key)
);

export function isStrictDomain(domain: string | null | undefined): domain is RequestedDomain {
	return domain != null && STRICT_DOMAINS.has(domain as RequestedDomain);
}

export function getDomain(key: string | null | undefined): DomainDefinition | null {
	if (!key) return null;
	return DOMAINS.find((d) => d.key === key) ?? null;
}
