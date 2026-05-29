import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
  coverage: {
    provider: 'v8',
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', '**/dist/**', '**/node_modules/**'],
    // Thresholds enforced by `pnpm test:coverage` — not by `pnpm test`.
    // Set at current actual baseline to prevent regression.
    // Targets are from docs/QA.md MUST TDD domains (see issue #188 for gap plan).
    thresholds: {
      // Parsers — MUST TDD target: 90% | current: ~39% stmts / ~32% branch
      // Gap plan: add provider unit tests (claude-code, codex, cursor parsing logic)
      'src/providers/**': {
        statements: 38,
        branches: 32,
        functions: 55,
        lines: 39,
      },
      // Migrations / DB layer — MUST TDD target: 90% | current: ~82% stmts / ~70% branch
      // Gap plan: add db/client.ts connection + write.ts transaction tests
      'src/db/**': {
        statements: 81,
        branches: 69,
        functions: 77,
        lines: 81,
      },
      // Shared utilities — MUST TDD target: 85% | current: ~64% stmts / ~54% branch
      // Gap plan: add utils/ollama-detect.ts and utils/hooks-utils.ts tests
      'src/utils/**': {
        statements: 63,
        branches: 53,
        functions: 72,
        lines: 70,
      },
    },
  },
});
