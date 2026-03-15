---
name: tdd-domain-check
enabled: true
event: bash
action: warn
pattern: git\s+commit
---

**TDD Domain Check: Tests Required for MUST Domains**

You are about to commit. If your change touches a TDD domain, confirm you have included tests.

**MUST TDD domains** (tests required before committing implementation):

| Domain | Path | Required test location |
|--------|------|----------------------|
| Source providers (parsers) | `cli/src/providers/` | `cli/src/providers/__tests__/*.test.ts` |
| Normalizers | `server/src/llm/*-normalize.ts` | Co-located `*-normalize.test.ts` |
| Migrations | `cli/src/db/migrate.ts` or `schema.ts` | `cli/src/db/__tests__/migrate.test.ts` |
| Shared utilities | `server/src/utils.ts`, `cli/src/utils/` | Co-located or `__tests__/*.test.ts` |

**Pre-commit checklist for TDD domains:**

1. `git diff --name-only --staged` — check which files you're committing
2. If any staged file matches a MUST TDD path, verify a `.test.ts` file is also staged
3. If you added implementation without tests: write the tests first, then commit both together

**This is a warning, not a hard block.** If your change:
- Only modifies non-domain code (dashboard, CLI command wiring) → safe to proceed
- Adds tests for existing untested code → safe to proceed (tests-only commit is fine)
- Adds implementation + tests together → safe to proceed

If you're unsure, run: `pnpm test` and confirm all tests pass before committing.
