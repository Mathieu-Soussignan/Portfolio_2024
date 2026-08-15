/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Server-side only — never exposed to the client bundle.
interface ImportMetaEnv {
	readonly MISTRAL_API_KEY?: string;
	readonly MISTRAL_MODEL?: string;
}
