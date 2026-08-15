/**
 * Post-LLM validation.
 *
 * A Mistral answer is displayed only if it survives these checks:
 *  - answer is a non-empty string;
 *  - the model did not mark the question out of scope (the deterministic V1
 *    engine already produces the correct refusal);
 *  - every referenced project resolves to a real portfolio project;
 *  - every referenced technology appears in the grounding context;
 *  - the claimed confidence is a valid level and does not exceed the
 *    evidence-based ceiling from the deterministic retrieval;
 *  - every claim (when the model returns the structured `claims` array) cites
 *    evidence ids that actually resolve, and does not carry an unsupported
 *    qualifier (production, deployment, scalability, mastery, conformity,
 *    expertise, specific year/version).
 *
 * On failure the caller discards the LLM answer and falls back to V1.
 */

import { normalize, tokenize } from "./intent.ts";
import { buildEvidenceRegistry, evidenceBlob } from "./evidence.ts";
import type { EvidenceAtom } from "./evidence.ts";
import type {
	ConfidenceLevel,
	CopilotContext,
	EvidenceClaim,
	MistralGeneration,
	PortfolioKnowledge,
} from "./types.ts";

export interface ValidationResult {
	ok: boolean;
	reason?: string;
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
	NO_EVIDENCE: 0,
	PARTIAL_MATCH: 1,
	HIGH_CONFIDENCE: 2,
	EXACT_MATCH: 3,
};

const STRONG_CONFIDENCE: ConfidenceLevel[] = ["EXACT_MATCH", "HIGH_CONFIDENCE"];

const CLAIM_KINDS = new Set(["documented", "reformulation", "inference"]);

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
	return typeof value === "string" && value in CONFIDENCE_RANK;
}

/** Every project referenced by the model must exist (by slug or exact title). */
function projectsResolve(references: string[], knowledge: PortfolioKnowledge): boolean {
	for (const reference of references) {
		const target = normalize(reference);
		const found = knowledge.projects.some(
			(p) => normalize(p.slug) === target || normalize(p.title) === target
		);
		if (!found) return false;
	}
	return true;
}

/**
 * True when `term` (normalized) appears as a contiguous token sequence in
 * `blob` (normalized). Exact token matching — no fuzzy/substring expansion —
 * so a technology must be explicitly present in the grounding context.
 */
function containsTokenSequence(blob: string, term: string): boolean {
	const haystack = tokenize(blob);
	const needle = tokenize(term);
	if (needle.length === 0) return false;
	for (let i = 0; i <= haystack.length - needle.length; i++) {
		let match = true;
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) {
				match = false;
				break;
			}
		}
		if (match) return true;
	}
	return false;
}

/**
 * Every technology referenced by the model must be explicitly present in the
 * grounding context. We check against the consolidated evidence blob (project
 * tags, descriptions, titles, skills, experience), so a technology documented
 * in a project description — e.g. "Pixtral 12B" — is accepted, while an absent
 * one is still rejected.
 */
function technologiesResolve(references: string[], context: CopilotContext): boolean {
	const blob = evidenceBlob(context);
	for (const reference of references) {
		const target = normalize(reference);
		if (!target) return false;
		if (!containsTokenSequence(blob, target)) return false;
	}
	return true;
}

/** True when the model claims a confidence above the evidence-based ceiling. */
function confidenceOverclaims(claimed: ConfidenceLevel, ceiling: ConfidenceLevel | null): boolean {
	const effective = ceiling ?? "HIGH_CONFIDENCE";
	return CONFIDENCE_RANK[claimed] > CONFIDENCE_RANK[effective];
}

// ---------------------------------------------------------------------------
// Grounding of strong qualifiers.
//
// A qualifier is a word that asserts a *strong* fact ("production", "scalable",
// "expertise", a specific year…). The model may only use one if the portfolio
// actually states it. Two kinds of checks:
//
//  1. Lexical rules: the qualifier word must literally appear in the evidence
//     that the claim cites (a fact present in the portfolio can be restated;
//     a technology being used can never be escalated to a qualifier).
//  2. Expertise rule: "expert"/"expertise"/"senior"/… assert a *level*. They
//     are only acceptable when the deterministic retrieval produced strong
//     (EXACT_MATCH or HIGH_CONFIDENCE) evidence for the exact domain.
//
// The scope is per-claim when the model returns `claims`; otherwise the whole
// answer is checked against the whole context.
// ---------------------------------------------------------------------------

interface LexicalRule {
	id: string;
	markers: string[];
	support: string[];
}

const LEXICAL_RULES: LexicalRule[] = [
	{
		// "production" is a strong claim that no portfolio fact states — do not
		// let the documented word "industrialisation" (Data pipelines) justify it.
		id: "production",
		markers: ["production"],
		support: ["production"],
	},
	{
		id: "industrialization",
		markers: ["industrialise", "industrialisee", "industrialisation"],
		support: ["industrialise", "industrialisee", "industrialisation"],
	},
	{
		id: "deployment",
		markers: ["deploye", "deployee", "deploiement"],
		support: ["deploye", "deployee", "deploiement"],
	},
	{
		id: "scalability",
		markers: [
			"scalable",
			"scalabilite",
			"evolutif",
			"evolutive",
			"montee en charge",
			"haute disponibilite",
			"haute dispo",
		],
		support: [
			"scalable",
			"scalabilite",
			"evolutif",
			"evolutive",
			"montee en charge",
			"haute disponibilite",
			"haute dispo",
		],
	},
	{
		id: "mastery",
		markers: ["maitrise", "maitriser", "maitrisee"],
		support: ["maitrise", "maitriser", "maitrisee"],
	},
	{
		id: "conformity",
		markers: ["conforme", "conformite", "certifie", "certifiee", "certification", "homologue", "homologation", "norme"],
		support: ["conforme", "conformite", "certifie", "certifiee", "certification", "homologue", "homologation", "norme"],
	},
];

/** Qualification words that assert a level only strong evidence justifies. */
const EXPERTISE_MARKERS = ["expert", "expertise", "specialiste", "specialise", "specialisation", "senior", "seniorite", "haut niveau"];

/** French negation tokens — a negated clause is a denial, not an overclaim. */
const NEGATION_TOKENS = new Set(["pas", "aucun", "sans", "non", "jamais", "rien", "guere"]);

function containsTerm(blob: string, term: string): boolean {
	if (term.includes(" ")) return blob.includes(term);
	return tokenize(blob).includes(term);
}

function clauseIsNegated(normalizedClause: string): boolean {
	return tokenize(normalizedClause).some((t) => NEGATION_TOKENS.has(t));
}

/** A specific year/version asserted by the answer must appear in the evidence. */
function unsupportedYear(clause: string, supportBlob: string): string | null {
	const years = clause.match(/\b(?:19|20)\d{2}\b/g) ?? [];
	for (const year of years) {
		if (!supportBlob.includes(year)) return year;
	}
	return null;
}

/**
 * Scan a text for lexical overclaims against a support blob (normalized
 * evidence). Returns the id of the first violated rule, or null.
 */
function lexicalOverclaim(text: string, supportBlob: string): string | null {
	const clauses = text
		.split(/[.!?;:]|\n/)
		.map((clause) => normalize(clause))
		.filter((clause) => clause.length > 0);

	for (const clause of clauses) {
		if (clauseIsNegated(clause)) continue;

		for (const rule of LEXICAL_RULES) {
			const hits = rule.markers.some((marker) => containsTerm(clause, marker));
			const supported = rule.support.some((term) => containsTerm(supportBlob, term));
			if (hits && !supported) return rule.id;
		}

		const year = unsupportedYear(clause, supportBlob);
		if (year) return "year";
	}

	return null;
}

/** True when the answer asserts a level (expert/senior/…) without strong evidence. */
function expertiseOverclaims(text: string, confidence: ConfidenceLevel | null): boolean {
	if (STRONG_CONFIDENCE.includes(confidence as ConfidenceLevel)) return false;
	const clauses = text
		.split(/[.!?;:]|\n/)
		.map((clause) => normalize(clause))
		.filter((clause) => clause.length > 0);

	for (const clause of clauses) {
		if (clauseIsNegated(clause)) continue;
		if (EXPERTISE_MARKERS.some((marker) => containsTerm(clause, marker))) return true;
	}
	return false;
}

/**
 * Validate the structured claims array: each claim must be well-formed, cite
 * only real evidence ids, and not carry an unsupported qualifier relative to
 * the evidence it cites.
 */
function validateClaims(claims: EvidenceClaim[], registry: Map<string, EvidenceAtom>): string | null {
	for (const claim of claims) {
		if (!claim || typeof claim.text !== "string" || claim.text.trim().length === 0) return "invalid_claim";
		if (!CLAIM_KINDS.has(claim.kind)) return "invalid_claim";

		const ids = Array.isArray(claim.evidenceIds) ? claim.evidenceIds : [];
		const cited: EvidenceAtom[] = [];
		for (const id of ids) {
			const atom = registry.get(id);
			if (!atom) return "unknown_evidence";
			cited.push(atom);
		}

		const citedBlob = cited.map((atom) => normalize(atom.text)).join(" ");
		const overclaim = lexicalOverclaim(claim.text, citedBlob);
		if (overclaim) return `unsupported_claim:${overclaim}`;
	}
	return null;
}

export function validateCopilotGeneration(
	generation: MistralGeneration | null | undefined,
	knowledge: PortfolioKnowledge,
	context: CopilotContext,
	baseConfidence: ConfidenceLevel | null
): ValidationResult {
	if (!generation || typeof generation.answer !== "string" || generation.answer.trim().length === 0) {
		return { ok: false, reason: "empty_answer" };
	}

	if (generation.outOfScope === true) {
		return { ok: false, reason: "out_of_scope" };
	}

	if (generation.referencedProjects && !projectsResolve(generation.referencedProjects, knowledge)) {
		return { ok: false, reason: "unknown_project" };
	}

	if (generation.referencedTechnologies && !technologiesResolve(generation.referencedTechnologies, context)) {
		return { ok: false, reason: "unknown_technology" };
	}

	if (generation.confidence != null) {
		if (!isConfidenceLevel(generation.confidence)) {
			return { ok: false, reason: "invalid_confidence" };
		}
		if (confidenceOverclaims(generation.confidence, baseConfidence)) {
			return { ok: false, reason: "confidence_overclaim" };
		}
	}

	// Structured claims: well-formed + per-claim evidence grounding.
	if (generation.claims !== undefined) {
		if (!Array.isArray(generation.claims)) {
			return { ok: false, reason: "invalid_claims" };
		}
		const registry = buildEvidenceRegistry(context);
		const claimError = validateClaims(generation.claims as EvidenceClaim[], registry);
		if (claimError) return { ok: false, reason: claimError };
	}

	// Whole-answer backstop at context scope (catches qualifiers outside the
	// claims array, e.g. when the model does not return claims at all).
	const contextBlob = evidenceBlob(context);
	const lexical = lexicalOverclaim(generation.answer, contextBlob);
	if (lexical) return { ok: false, reason: `unsupported_claim:${lexical}` };

	if (expertiseOverclaims(generation.answer, context.confidence)) {
		return { ok: false, reason: "unsupported_claim:expertise" };
	}

	return { ok: true };
}
