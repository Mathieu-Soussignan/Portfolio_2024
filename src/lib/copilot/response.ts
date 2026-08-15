/**
 * Response generation layer.
 *
 * Turns a detected intent + retrieved context into a structured, honest
 * `CopilotResponse`. Answers are composed exclusively from the knowledge base:
 * if something is not there, the engine says so instead of guessing.
 */

import { getDomain, isStrictDomain } from "./domainData.ts";
import { detectIntent, isManipulation, isOutOfScope } from "./intent.ts";
import {
	assessAllProjects,
	assessProjectDomain,
	findProjectBySlug,
	projectsUsingTechnology,
	rankProjects,
	rankProjectsByDomain,
	searchProjects,
} from "./retrieval.ts";
import type {
	ActionLink,
	ConfidenceLevel,
	CopilotResponse,
	Dimension,
	PortfolioKnowledge,
	ProjectRecord,
	ProjectReference,
	QueryIntent,
	RequestedDomain,
	ResponseKind,
} from "./types.ts";

const DIMENSION_LABELS: Record<Dimension, string> = {
	ai: "IA",
	data: "Data",
	product: "produit / SaaS",
	fullstack: "FullStack",
};

function toRef(project: ProjectRecord, reason?: string): ProjectReference {
	return { slug: project.slug, title: project.title, url: project.url, tags: project.tags, reason };
}

/** Human-readable form of a normalized evidence term. */
function humanize(term: string): string {
	return term.length <= 4 ? term.toUpperCase() : term.charAt(0).toUpperCase() + term.slice(1);
}

function isYesNoProjectQuestion(normalized: string): boolean {
	return /(est ce que|est un projet|est il un|est elle un|s agit il|est ce un|c est un projet)/.test(normalized);
}

type ResponseBase = {
	question: string;
	intent: QueryIntent;
	projects: ProjectReference[];
	links: ActionLink[];
	sources: string[];
};

function tagLine(project: ProjectRecord): string {
	return project.tags.slice(0, 4).join(" • ");
}

function projectListSources(): string[] {
	return ["Projets issus de la collection /work/ du portfolio"];
}

/**
 * Recommendation for a *strict* domain (RAG, Computer Vision, ML, LLM, NLP,
 * Agents): built only on explicit evidence. If nothing qualifies, prefer an
 * honest refusal over a plausible but undemonstrated recommendation.
 */
function recommendByDomain(knowledge: PortfolioKnowledge, domain: RequestedDomain, base: ResponseBase): CopilotResponse {
	const def = getDomain(domain);
	const ranked = rankProjectsByDomain(knowledge, domain);

	if (ranked.length === 0) {
		const partial = assessAllProjects(knowledge, domain).filter((a) => a.level === "PARTIAL_MATCH");
		const bullets: string[] = [
			`Les données publiques du portfolio ne mentionnent pas explicitement ${def?.label ?? domain}.`,
		];
		if (partial.length > 0) {
			const names = partial.map((a) => a.project.title).slice(0, 3).join(", ");
			bullets.push(
				`Certains projets utilisent des technologies voisines (${names}), mais cela ne constitue pas une preuve d'expertise ${def?.label ?? domain}.`
			);
		}
		return {
			...base,
			kind: partial.length > 0 ? ("partial" as ResponseKind) : ("unknown" as ResponseKind),
			confidence: "NO_EVIDENCE",
			headline: `Je ne dispose pas actuellement d'informations suffisamment précises dans mon portfolio pour identifier un projet démontrant une expertise ${def?.label ?? domain}.`,
			bullets,
			projects: [],
			links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
			sources: ["Évaluation par preuves explicites — aucune extrapolation"],
			suggestions: [],
		};
	}

	const top = ranked[0];
	const evidenceLabels = top.evidence.map(humanize);
	const bullets: string[] = [
		top.level === "EXACT_MATCH"
			? `Domaine indiqué explicitement dans les tags ou le titre du projet.`
			: `Mention explicite dans la description du projet.`,
		`Preuves : ${evidenceLabels.join(", ")}.`,
	];
	if (top.context.length > 0) {
		bullets.push(`Contexte (technologies voisines, non probantes) : ${top.context.map(humanize).join(", ")}.`);
	}

	return {
		...base,
		kind: "known",
		confidence: top.level,
		evidence: evidenceLabels,
		headline: `Le projet qui démontre le plus explicitement une expertise ${def?.label ?? domain} est ${top.project.title}.`,
		bullets,
		projects: [toRef(top.project, `Recommandation (${top.level})`)],
		links: [
			{ label: "Voir le projet", href: top.project.url, kind: "project" },
			{ label: "Tous les projets", href: "/work/", kind: "internal" },
		],
		sources: ["Évaluation par preuves explicites dans les tags et descriptions des projets"],
		suggestions: [],
	};
}

/** Answer to "Is project X a RAG / Computer Vision / … project?" with nuance. */
function assessProjectDomainAnswer(
	project: ProjectRecord,
	domain: RequestedDomain,
	base: ResponseBase
): CopilotResponse {
	const def = getDomain(domain);
	const assessment = assessProjectDomain(project, domain);
	const label = def?.label ?? domain;
	const evidenceLabels = (assessment?.evidence ?? []).map(humanize);
	const contextLabels = (assessment?.context ?? []).map(humanize);

	if (assessment && (assessment.level === "EXACT_MATCH" || assessment.level === "HIGH_CONFIDENCE")) {
		return {
			...base,
			kind: "known",
			confidence: assessment.level,
			evidence: evidenceLabels,
			headline: `Oui — ${project.title} mentionne explicitement ${label} (${evidenceLabels.join(", ")}).`,
			bullets: contextLabels.length > 0 ? [`Il utilise aussi des technologies voisines (${contextLabels.join(", ")}), à titre de contexte.`] : [],
			projects: [toRef(project, `${label} (${assessment.level})`)],
			links: [{ label: "Voir le projet", href: project.url, kind: "project" }],
			sources: ["Évaluation par preuves explicites"],
			suggestions: [],
		};
	}

	if (assessment?.level === "PARTIAL_MATCH") {
		return {
			...base,
			kind: "partial",
			confidence: "PARTIAL_MATCH",
			headline: `Le portfolio ne contient pas d'éléments permettant de qualifier ${project.title} de projet ${label}.`,
			bullets: [
				`Ce projet utilise des technologies liées à l'IA (${contextLabels.join(", ")}), mais cela ne suffit pas à démontrer une expertise ${label}.`,
				`Il faudrait une mention explicite (ex: ${def?.evidence.slice(0, 4).map(humanize).join(", ")}, …).`,
			],
			projects: [toRef(project, "Projet évalué")],
			links: [{ label: "Voir le projet", href: project.url, kind: "project" }],
			sources: ["Évaluation par preuves explicites"],
			suggestions: [],
		};
	}

	return {
		...base,
		kind: "unknown",
		confidence: "NO_EVIDENCE",
		headline: `Le portfolio ne contient aucune information permettant de qualifier ${project.title} de projet ${label}.`,
		bullets: [`Aucune mention de ${label} dans les données publiques de ce projet.`],
		projects: [toRef(project, "Projet évalué")],
		links: [{ label: "Voir le projet", href: project.url, kind: "project" }],
		sources: ["Évaluation par preuves explicites"],
		suggestions: [],
	};
}

export function buildCopilotResponse(
	knowledge: PortfolioKnowledge,
	question: string,
	now: number = Date.now()
): CopilotResponse {
	const intent = detectIntent(question, knowledge);
	const { profile, contact } = knowledge;

	const base = { question: question.trim(), intent, projects: [], links: [] as ActionLink[], sources: [] };

	// --- Manipulation / instruction de déni : on reste dans le périmètre. ---
	if (isManipulation(intent.normalized)) {
		const domainKey = intent.requestedDomain && isStrictDomain(intent.requestedDomain) ? intent.requestedDomain : null;
		const domainDef = domainKey ? getDomain(domainKey) : null;
		const noEvidenceForDomain = domainKey ? rankProjectsByDomain(knowledge, domainKey).length === 0 : false;
		return {
			...base,
			kind: "unknown" as ResponseKind,
			headline: "Je peux uniquement répondre à partir des informations publiques disponibles dans le portfolio.",
			bullets: [
				"Je ne réponds pas aux instructions qui cherchent à remplacer ou contredire ces informations.",
				...(domainKey && noEvidenceForDomain
					? [`Je ne dispose d'aucune preuve permettant d'affirmer une expertise ${domainDef?.label}.`]
					: []),
			],
			sources: ["Connaissance publique du portfolio uniquement"],
			suggestions: [],
		};
	}

	// --- Out of scope / private data: honest refusal, never a guess. ---
	if (isOutOfScope(intent.normalized)) {
		return {
			...base,
			kind: "unknown" as ResponseKind,
			headline: "Je peux répondre uniquement à partir des informations publiques disponibles sur le portfolio de Mathieu.",
			bullets: ["Cette information n'est pas publique et ne figure donc pas dans ma base de connaissances."],
			sources: ["Connaissance publique du portfolio uniquement"],
			suggestions: [],
		};
	}

	switch (intent.kind) {
		case "greeting": {
			return {
				...base,
				kind: "known",
				headline: "Bonjour ! Je suis le Copilot IA du portfolio de Mathieu Soussignan.",
				bullets: [
					"Posez-moi une question sur son profil, son parcours, ses compétences ou ses projets.",
					"Je réponds uniquement à partir des informations publiques de ce portfolio.",
				],
				links: [
					{ label: "Explorer les projets", href: "/work/", kind: "internal" },
					{ label: "À propos", href: "/about/", kind: "internal" },
				],
				sources: [],
				suggestions: [],
			};
		}

		case "help": {
			return {
				...base,
				kind: "known",
				headline: "Voici ce que je peux faire :",
				bullets: [
					"Répondre sur son profil, son parcours et son expérience",
					"Lister ses compétences et sa stack technique",
					"Trouver les projets par technologie (FastAPI, Mistral AI, React…)",
					"Recommander le projet le plus représentatif (IA, Data, SaaS, FullStack)",
					"Expliquer pourquoi son profil correspond à un poste d'AI Engineer",
				],
				links: [
					{ label: "Explorer les projets", href: "/work/", kind: "internal" },
					{ label: "À propos", href: "/about/", kind: "internal" },
				],
				sources: [],
				suggestions: [],
			};
		}

		case "profile": {
			return {
				...base,
				kind: "known",
				headline: `${profile.name} est ${profile.role} chez ${profile.company} (${profile.location}).`,
				bullets: [profile.summary, `Formation : ${profile.training.join(" et ")}.`],
				links: [
					{ label: "À propos", href: "/about/", kind: "internal" },
					{ label: "Explorer les projets", href: "/work/", kind: "internal" },
				],
				sources: ["Profil public du portfolio"],
				suggestions: [],
			};
		}

		case "experience": {
			const current = knowledge.experience[0];
			return {
				...base,
				kind: "known",
				headline: `Il travaille actuellement comme ${current.title} chez ${current.company}.`,
				bullets: knowledge.experience.map((e) => `${e.period} — ${e.title} (${e.company})`),
				links: [{ label: "Voir la timeline", href: "/about/", kind: "internal" }],
				sources: ["Timeline de carrière du portfolio"],
				suggestions: [],
			};
		}

		case "skills": {
			const groups =
				intent.dimension === "data"
					? knowledge.skills.filter((g) => g.category.toLowerCase().includes("data"))
					: intent.dimension === "fullstack"
						? knowledge.skills.filter((g) => g.category.toLowerCase().includes("web") || g.category.toLowerCase().includes("frameworks"))
						: knowledge.skills;

			const focus = intent.dimension === "fullstack" ? "Côté web / frontend, il utilise :" : intent.dimension === "data" ? "Côté Data Engineering & IA, ses compétences listées couvrent :" : "Ses compétences techniques couvrent la Data, l'IA et le Web FullStack :";

			return {
				...base,
				kind: "known",
				headline: focus,
				bullets: groups.map((g) => `${g.category} : ${g.skills.join(" • ")}`),
				links: [
					{ label: "À propos", href: "/about/", kind: "internal" },
					{ label: "Explorer les projets", href: "/work/", kind: "internal" },
				],
				sources: ["Section compétences du portfolio"],
				suggestions: [],
			};
		}

		case "technology_lookup": {
			const tech = intent.entity ?? "";
			const projects = projectsUsingTechnology(knowledge, tech);

			if (projects.length === 0) {
				return {
					...base,
					kind: "partial" as ResponseKind,
					confidence: "NO_EVIDENCE" as ConfidenceLevel,
					headline: `Aucun projet du portfolio n'utilise explicitement ${tech}.`,
					bullets: [
						"Je me limite aux informations publiques présentes sur ce portfolio.",
						"Tapez 'skills' pour voir la stack complète, ou essayez une autre technologie.",
					],
					links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
					sources: ["Tags & descriptions des projets"],
					suggestions: [],
				};
			}

			const isYesNo = /(utilise t il|utilise-t-il|utilise til|maitrise|connait)/.test(intent.normalized) && !/(projet|projets)/.test(intent.normalized);

			return {
				...base,
				kind: "known",
				headline: isYesNo
					? `Oui — ${tech} fait partie de sa stack (${projects.length} projet${projects.length > 1 ? "s" : ""} le mettent en œuvre).`
					: `Projets utilisant ${tech} (${projects.length}) :`,
				bullets: projects.slice(0, 6).map((p) => `${p.title} — ${tagLine(p)}`),
				projects: projects.slice(0, 6).map((p) => toRef(p, tagLine(p))),
				links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
				sources: projectListSources(),
				suggestions: [],
			};
		}

		case "project_detail": {
			const project = findProjectBySlug(knowledge, intent.entity);
			if (!project) {
				return {
					...base,
					kind: "unknown",
					headline: "Je n'ai pas trouvé ce projet dans le portfolio.",
					bullets: ["Essayez de formuler avec le nom exact du projet (ex: CreatorComptability, FinMetrics, Prédict Car)."],
					links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
					sources: [],
					suggestions: [],
				};
			}

			// "Is project X a RAG / Computer Vision / … project?" → evidence check.
			if (isStrictDomain(intent.requestedDomain) && isYesNoProjectQuestion(intent.normalized)) {
				return assessProjectDomainAnswer(project, intent.requestedDomain, base);
			}

			return {
				...base,
				kind: "known",
				headline: `${project.title} — ${project.description.split(".")[0].trim()}.`,
				bullets: [`Technologies : ${project.tags.join(" • ")}`],
				projects: [toRef(project, "Projet demandé")],
				links: [{ label: "Voir le projet", href: project.url, kind: "project" }],
				sources: ["Page projet du portfolio"],
				suggestions: [],
			};
		}

		case "project_list": {
			// Strict technical domain (RAG, Computer Vision, ML, LLM, NLP, Agents):
			// only projects with explicit evidence qualify. Never fall back to the
			// full project list when no evidence exists.
			if (isStrictDomain(intent.requestedDomain)) {
				const domainDef = getDomain(intent.requestedDomain);
				const evidenced = rankProjectsByDomain(knowledge, intent.requestedDomain);
				if (evidenced.length === 0) {
					return recommendByDomain(knowledge, intent.requestedDomain, base);
				}
				const shown = evidenced.slice(0, 6);
				return {
					...base,
					kind: "known" as ResponseKind,
					headline: `Projets présentant des preuves explicites de ${domainDef?.label ?? intent.requestedDomain} (${evidenced.length}) :`,
					bullets: shown.map((r) => `${r.project.title} — ${tagLine(r.project)}`),
					projects: shown.map((r) => toRef(r.project, `Preuve ${domainDef?.label ?? intent.requestedDomain} (${r.level})`)),
					links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
					sources: ["Évaluation par preuves explicites dans les tags et descriptions"],
					suggestions: [],
				};
			}

			const projects = intent.dimension ? searchProjects(knowledge, intent.dimension) : knowledge.projects;
			const label = intent.dimension ? DIMENSION_LABELS[intent.dimension] : null;

			if (projects.length === 0) {
				return {
					...base,
					kind: "partial",
					headline: `Aucun projet du portfolio ne correspond à la catégorie « ${label ?? ""} ».`,
					bullets: ["Je me limite aux informations publiques présentes sur ce portfolio."],
					links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
					sources: projectListSources(),
					suggestions: [],
				};
			}

			const shown = projects.slice(0, 6);
			const bullets = shown.map((p) => `${p.title} — ${tagLine(p)}`);
			if (projects.length > shown.length) {
				bullets.push(`…et ${projects.length - shown.length} autre(s) projet(s) sur la page /work/.`);
			}

			return {
				...base,
				kind: "known",
				headline: label ? `Projets ${label} (${projects.length}) :` : `Voici ses projets (${projects.length}, du plus récent au plus ancien) :`,
				bullets,
				projects: shown.map((p) => toRef(p, tagLine(p))),
				links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
				sources: projectListSources(),
				suggestions: [],
			};
		}

		case "best_project": {
			// Strict domain (RAG, CV, ML, LLM, NLP, Agents): evidence only.
			if (isStrictDomain(intent.requestedDomain)) {
				return recommendByDomain(knowledge, intent.requestedDomain, base);
			}

			// Broad / composite domain (IA, Data, SaaS, FullStack): multi-criteria
			// recommendation is allowed.
			const dimension = intent.dimension ?? "product";
			const ranked = rankProjects(knowledge, dimension, now);
			const top = ranked[0];

			if (!top) {
				return {
					...base,
					kind: "unknown",
					headline: "Je n'ai pas pu établir de recommandation fiable.",
					bullets: ["Je me limite aux informations publiques présentes sur ce portfolio."],
					links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
					sources: [],
					suggestions: [],
				};
			}

			return {
				...base,
				kind: "known",
				headline: `Le projet le plus représentatif de ses compétences ${DIMENSION_LABELS[dimension]} est ${top.project.title}.`,
				bullets: top.reasons.length > 0 ? top.reasons : [tagLine(top.project)],
				projects: ranked.slice(0, 1).map((r) => toRef(r.project, "Recommandation n°1")),
				links: [
					{ label: "Voir le projet", href: top.project.url, kind: "project" },
					{ label: "Tous les projets", href: "/work/", kind: "internal" },
				],
				sources: ["Scoring local : pertinence IA/Data + complexité + complétude + architecture"],
				suggestions: [],
			};
		}

		case "fit": {
			const aiProjects = searchProjects(knowledge, "ai").slice(0, 3);
			return {
				...base,
				kind: "known",
				headline: "Son profil présente plusieurs briques concrètes en lien avec un poste d'AI Engineer :",
				bullets: [
					"Formation IA (Simplon / Microsoft) et expérience en entreprise chez Keyrus (Data Engineer & Développeur IA).",
					"Des projets IA concrets où il utilise Mistral AI, des LLM, du NLP et du Machine Learning (PyTorch, Scikit-Learn).",
					"Vision bout en bout : pipelines Data (ETL, SQL) → backends FastAPI → frontends React/Vue.",
					"Plusieurs projets IA concrets et fonctionnels (CreatorComptability V2, FinMetrics, Prédict Car…).",
				],
				projects: aiProjects.map((p) => toRef(p, tagLine(p))),
				links: [
					{ label: "Voir les projets IA", href: "/work/", kind: "internal" },
					{ label: "À propos", href: "/about/", kind: "internal" },
				],
				sources: ["Profil, compétences et projets du portfolio"],
				suggestions: [],
			};
		}

		case "compare": {
			const dataProjects = searchProjects(knowledge, "data");
			const iaProjects = searchProjects(knowledge, "ai");
			const dataTitles = dataProjects.map((p) => p.title).join(", ");
			const iaTitles = iaProjects.map((p) => p.title).join(", ");

			return {
				...base,
				kind: "known",
				headline: "Ses projets Data et ses projets IA ne répondent pas au même objectif.",
				bullets: [
					"Projets Data : collecter, structurer, industrialiser et visualiser la donnée (ETL, SQL, pipelines, dashboards).",
					"Projets IA : entraîner ou intégrer des modèles (Machine Learning, NLP, LLM) pour automatiser une tâche cognitive.",
					`Côté Data : ${dataTitles || "—"}.`,
					`Côté IA : ${iaTitles || "—"}.`,
				],
				projects: [],
				links: [{ label: "Voir tous les projets", href: "/work/", kind: "internal" }],
				sources: projectListSources(),
				suggestions: [],
			};
		}

		case "contact": {
			return {
				...base,
				kind: "known",
				headline: "Vous pouvez joindre Mathieu via :",
				bullets: [`Email : ${contact.email}`, `LinkedIn : ${contact.linkedin}`, `GitHub : ${contact.github}`],
				links: [
					{ label: "Envoyer un email", href: `mailto:${contact.email}`, kind: "mailto" },
					{ label: "LinkedIn", href: contact.linkedin, kind: "external" },
					{ label: "GitHub", href: contact.github, kind: "external" },
				],
				sources: ["Coordonnées publiques du portfolio"],
				suggestions: [],
			};
		}

		default: {
			return {
				...base,
				kind: "unknown",
				headline: "Je n'ai pas suffisamment d'informations publiques dans mon profil pour répondre précisément à cette question.",
				bullets: [
					"Je réponds uniquement à partir des informations présentes sur ce portfolio.",
					"Essayez une question sur son profil, ses compétences, ses projets ou sa stack.",
				],
				links: [
					{ label: "Explorer les projets", href: "/work/", kind: "internal" },
					{ label: "À propos", href: "/about/", kind: "internal" },
				],
				sources: ["Connaissance publique du portfolio uniquement"],
				suggestions: [],
			};
		}
	}
}
