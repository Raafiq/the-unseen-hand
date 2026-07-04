import { defineConfig } from 'vitest/config';

// Unit tests for pure client-side logic (composition, derivations). Kept separate
// from the Playwright e2e suite (`tests/`, driven by `test:e2e`): those need a real
// browser, these are node-fast. Test files live beside their module as `*.test.ts`.
// `@ugs/core` resolves through its built `dist` (node_modules symlink) — the same way
// the Vite app build consumes it — so keep `@ugs/core` built before running.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
