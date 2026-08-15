/**
 * Structured knowledge base for the portfolio copilot.
 *
 * This is the single source of truth the local engine answers from. The
 * project data is reused from the existing `work` content collection (never
 * duplicated), while the profile / experience / skills / contact facts that are
 * currently scattered across UI components are consolidated here so the engine
 * has a stable, typed record of what is publicly stated on the portfolio.
 */

import type { ExperienceItem, PortfolioKnowledge, ProjectRecord, SkillGroup } from "./types.ts";

/** Minimal structural shape of a `work` collection entry (Astro-agnostic). */
export interface WorkEntryLike {
	slug: string;
	data: {
		title: string;
		description: string;
		tags: string[];
		publishDate: Date;
	};
}

export interface ProfileSection {
	name: string;
	role: string;
	company: string;
	location: string;
	summary: string;
	training: string[];
}

/** Public profile facts (mirror `whoami` / hero). */
export const profile: ProfileSection = {
	name: "Mathieu Soussignan",
	role: "Data Engineer & Développeur IA",
	company: "Keyrus",
	location: "Marseille / Aix-en-Provence",
	summary:
		"Data Engineer & Développeur IA chez Keyrus (Marseille). Il conçoit des architectures Data robustes et des applications Web & IA de bout en bout.",
	training: ["Développeur IA (Simplon / Microsoft)", "Développeur Web FullStack (Simplon)"],
};

/** Architecture / positioning statement (the "vision 360°" shown on the site). */
export const positioning =
	"Vision 360° Data → UI : de la collecte et de la préparation des données (ETL, SQL, ML) jusqu'à la création d'interfaces fluides (React, FastAPI, Astro).";

/** Career milestones (mirror the about-page timeline). */
export const experience: ExperienceItem[] = [
	{
		period: "Juin 2026 — Présent",
		title: "Data Engineer & Développeur IA (CDI)",
		company: "Keyrus — Aix-en-Provence",
		description:
			"Conception et industrialisation d'architectures de données, pipelines ETL, intégration de modèles de Machine Learning & LLM appliqués aux besoins métiers.",
		tags: ["Data Engineering", "Python", "SQL", "Pipelines ETL", "AI / ML", "Docker"],
	},
	{
		period: "2024 — 2026",
		title: "Alternance Data & IA + Formation Développeur IA",
		company: "Keyrus & Simplon / Microsoft",
		description:
			"Montée en puissance sur les algorithmes d'apprentissage automatique, traitement du langage naturel (NLP), modélisation et livraison de projets Data en entreprise.",
		tags: ["PyTorch", "Scikit-Learn", "FastAPI", "Pandas", "Agile"],
	},
	{
		period: "2023",
		title: "Formation Développeur Web & Web Mobile",
		company: "Simplon",
		description:
			"Formation intensive en pédagogie active. Maîtrise des fondamentaux du développement fullstack, bases de données, architecture logicielle et travail en équipe.",
		tags: ["React", "JavaScript", "HTML/CSS", "Node.js", "SQL"],
	},
	{
		period: "Avant 2023",
		title: "Reconversion Professionnelle & Déclic Tech",
		company: "Parcours Initial",
		description:
			"Découverte de la programmation et passion immédiate pour la création de solutions utiles, la résolution de problèmes complexes et la modélisation.",
		tags: ["Autonomie", "Résolution de problèmes", "Reconversion"],
	},
];

/** Technical skills grouped by domain (mirror the about page). */
export const skills: SkillGroup[] = [
	{
		category: "Data Engineering & IA",
		skills: [
			"Pipelines ETL",
			"Python",
			"SQL & PostgreSQL",
			"PyTorch",
			"Scikit-Learn",
			"LLM & NLP",
			"Pandas & NumPy",
		],
	},
	{
		category: "Développement Web & Frameworks",
		skills: [
			"React",
			"FastAPI",
			"Astro",
			"Flask",
			"Vue.js",
			"TypeScript",
			"JavaScript (ES6+)",
			"Tailwind CSS",
			"HTML5 & CSS3",
		],
	},
	{
		category: "DevOps & Outils",
		skills: ["Docker", "Git & GitHub", "CI/CD Actions", "Méthodes Agile (Scrum)", "Architecture SaaS"],
	},
];

export const contact = {
	email: "contact@mathieu-soussignan.com",
	linkedin: "https://www.linkedin.com/in/mathieu-soussignan-007a07158/",
	github: "https://github.com/Mathieu-Soussignan",
};

/**
 * Build the full knowledge base by reusing the existing `work` collection.
 * No project information is duplicated here — it is mapped 1:1 from the
 * content frontmatter.
 */
export function buildPortfolioKnowledge(workEntries: WorkEntryLike[]): PortfolioKnowledge {
	const projects: ProjectRecord[] = workEntries
		.map((entry) => ({
			slug: entry.slug,
			title: entry.data.title,
			description: entry.data.description,
			tags: entry.data.tags,
			url: `/work/${entry.slug}/`,
			publishDate: entry.data.publishDate.toISOString(),
		}))
		.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

	return {
		profile,
		positioning,
		experience,
		skills,
		projects,
		contact,
	};
}
