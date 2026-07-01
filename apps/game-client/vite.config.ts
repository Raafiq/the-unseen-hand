import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `base` defaults to '/' for local dev, `vite preview`, and Playwright e2e.
// The GitHub Pages preview deploy sets BASE_PATH=/the-unseen-hand/ so built
// asset URLs resolve under the project-site subpath.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
});
