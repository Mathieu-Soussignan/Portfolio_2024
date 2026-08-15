/**
 * DOM renderer for copilot output.
 *
 * Lives on the client only (uses `document`) and is deliberately separate from
 * the engine so the engine stays pure and testable. All text is injected with
 * `textContent` — never `innerHTML` — since a question typed by a visitor is
 * echoed back into the history.
 */

import type { CopilotResponse } from "./types.ts";

/** Build the premium answer block shown in the terminal. */
export function renderCopilotAnswer(response: CopilotResponse): HTMLDivElement {
	const root = document.createElement("div");
	root.className = "copilot-answer";

	const headline = document.createElement("p");
	headline.className = "copilot-headline";
	headline.textContent = response.headline;
	root.appendChild(headline);

	if (response.confidence) {
		const confidenceLabels: Record<string, string> = {
			EXACT_MATCH: "Preuve explicite",
			HIGH_CONFIDENCE: "Confiance élevée",
			PARTIAL_MATCH: "Correspondance partielle",
			NO_EVIDENCE: "Aucune preuve",
		};
		const badge = document.createElement("p");
		badge.className = `copilot-confidence copilot-confidence-${response.confidence.toLowerCase()}`;
		badge.textContent = `Niveau de confiance : ${confidenceLabels[response.confidence] ?? response.confidence}`;
		root.appendChild(badge);
	}

	if (response.bullets.length > 0) {
		const list = document.createElement("ul");
		list.className = "copilot-bullets";
		for (const bullet of response.bullets) {
			const item = document.createElement("li");
			item.textContent = bullet;
			list.appendChild(item);
		}
		root.appendChild(list);
	}

	if (response.projects.length > 0) {
		const projects = document.createElement("div");
		projects.className = "copilot-projects";
		for (const ref of response.projects) {
			const link = document.createElement("a");
			link.className = "copilot-project";
			link.href = ref.url;
			link.setAttribute("aria-label", `Voir le projet ${ref.title}`);

			const title = document.createElement("span");
			title.className = "copilot-project-title";
			title.textContent = ref.title;
			link.appendChild(title);

			if (ref.reason) {
				const reason = document.createElement("span");
				reason.className = "copilot-project-reason";
				reason.textContent = ref.reason;
				link.appendChild(reason);
			}
			projects.appendChild(link);
		}
		root.appendChild(projects);
	}

	if (response.links.length > 0) {
		const actions = document.createElement("div");
		actions.className = "copilot-actions";
		for (const link of response.links) {
			const anchor = document.createElement("a");
			anchor.className = "copilot-action";
			anchor.href = link.href;
			anchor.textContent = `→ ${link.label}`;
			if (link.kind === "external") {
				anchor.target = "_blank";
				anchor.rel = "noopener noreferrer";
			}
			actions.appendChild(anchor);
		}
		root.appendChild(actions);
	}

	if (response.sources.length > 0) {
		const sources = document.createElement("p");
		sources.className = "copilot-sources";
		sources.textContent = `Sources : ${response.sources.join(" · ")}`;
		root.appendChild(sources);
	}

	return root;
}

/** Build the tappable "Suggested queries" row. */
export function renderCopilotSuggestions(suggestions: string[], onPick: (question: string) => void): HTMLDivElement {
	const wrap = document.createElement("div");
	wrap.className = "copilot-suggestions";
	wrap.setAttribute("role", "group");
	wrap.setAttribute("aria-label", "Questions suggérées");

	const label = document.createElement("span");
	label.className = "copilot-suggestions-label";
	label.textContent = "Suggested queries";
	wrap.appendChild(label);

	for (const suggestion of suggestions) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "copilot-suggestion";
		button.textContent = `› ${suggestion}`;
		button.setAttribute("aria-label", `Poser la question : ${suggestion}`);
		button.addEventListener("click", () => onPick(suggestion));
		wrap.appendChild(button);
	}

	return wrap;
}
