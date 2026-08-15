import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
//
// `hybrid` keeps every existing page prerendered as static HTML and only opts
// server-rendered routes (src/pages/api/copilot.ts) into an on-demand runtime.
// This is required so the Mistral API key lives server-side only.
export default defineConfig({
  output: 'hybrid',
  adapter: vercel(),
});
