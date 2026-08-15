/**
 * Evidence registry.
 *
 * Assigns a stable, deterministic ID to every fact in a grounding context so
 * that (a) the prompt can tell Mistral which IDs exist, and (b) the validator
 * can verify that the IDs a claim cites actually resolve to real evidence.
 *
 * The ordering is a pure function of the context: the same context always
 * yields the same IDs, so the registry rebuilt by the validator matches the one
 * rendered into the prompt byte-for-byte — there is a single source of truth
 * and no drift between the two sides.
 */

import { normalize, tokenize } from "./intent.ts";
import type { CopilotContext } from "./types.ts";

/** A single fact from the context, with a stable ID and normalized tokens. */
export interface EvidenceAtom {
	id: string;
	/** Original, human-readable evidence text. */
	text: string;
	/** Normalized tokens used for lexical support checks. */
	tokens: string[];
}

/**
 * Build the ordered list of evidence atoms for a context.
 *
 * IDs use this deterministic scheme:
 *   profile.name / profile.role / profile.company / profile.location /
 *   profile.summary / profile.training.<i>
 *   skill.<i>
 *   experience.<i>.period / .title / .company / .description
 *   project.<slug>.title / project.<slug>.description / project.<slug>.tag.<i>
 *   evidence.<i>
 */
export function buildEvidenceAtoms(context: CopilotContext): EvidenceAtom[] {
	const atoms: EvidenceAtom[] = [];
	const push = (id: string, text: string) => {
		const trimmed = (text ?? "").trim();
		if (!trimmed) return;
		atoms.push({ id, text: trimmed, tokens: tokenize(normalize(trimmed)) });
	};

	const { profile } = context;
	push("profile.name", profile.name);
	push("profile.role", profile.role);
	push("profile.company", profile.company);
	push("profile.location", profile.location);
	push("profile.summary", profile.summary);
	profile.training.forEach((item, i) => push(`profile.training.${i}`, item));

	context.skills.forEach((skill, i) => push(`skill.${i}`, skill));

	context.experience.forEach((exp, i) => {
		push(`experience.${i}.period`, exp.period);
		push(`experience.${i}.title`, exp.title);
		push(`experience.${i}.company`, exp.company);
		push(`experience.${i}.description`, exp.description);
	});

	for (const project of context.projects) {
		push(`project.${project.slug}.title`, project.title);
		push(`project.${project.slug}.description`, project.description);
		project.tags.forEach((tag, i) => push(`project.${project.slug}.tag.${i}`, tag));
	}

	context.evidence.forEach((term, i) => push(`evidence.${i}`, term));

	return atoms;
}

/** Map of evidence id → atom, rebuilt deterministically from the context. */
export function buildEvidenceRegistry(context: CopilotContext): Map<string, EvidenceAtom> {
	return new Map(buildEvidenceAtoms(context).map((atom) => [atom.id, atom]));
}

/** All evidence as a single normalized blob (for lexical support checks). */
export function evidenceBlob(context: CopilotContext): string {
	return buildEvidenceAtoms(context)
		.map((atom) => normalize(atom.text))
		.join(" ");
}
