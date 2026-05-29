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
      // API routes — SHOULD TDD target: 70% | current: ~82% stmts / ~69% branch
      // Branches just below 70% target; floor set at current to avoid regression.
      'src/routes/**': {
        statements: 81,
        branches: 68,
        functions: 78,
        lines: 82,
      },
      // Analysis pricing — MUST TDD target: 85% | current: ~34% stmts / ~48% branch
      // Gap plan: add unit tests for cost calculation functions in analysis-pricing.ts
      'src/llm/analysis-pricing.ts': {
        statements: 34,
        branches: 47,
        functions: 66,
        lines: 33,
      },
      // NOTE: response-parsers.ts (MUST TDD target: 85%) shows 0% coverage.
      // No threshold set here — floor of 0% enforces nothing.
      // Gap plan: write response-parsers.test.ts before next change to that file.
      //
      // NOTE: *-normalize.ts files show 0% in server coverage due to V8
      // re-export attribution. Implementations live in cli/src/analysis/ (100% covered).
      // Threshold enforcement is handled by cli/vitest.config.ts.
    },
  },
});
