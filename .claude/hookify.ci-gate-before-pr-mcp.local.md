---
name: ci-gate-before-pr-mcp
enabled: true
event: all
action: block
tool_matcher: mcp__plugin_github_github__create_pull_request
---

**CI Gate: Build + Tests MUST Pass Before PR Creation**

BLOCKED. You must run BOTH build and tests before creating a PR via MCP:

```bash
cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build && pnpm test
```

**Why this is a hard block:** GitHub Actions usage costs money. Every failed CI run is wasted spend. Running build + tests locally catches failures before they reach CI.

**To proceed:**
1. Run `pnpm build && pnpm test` and confirm ALL pass (zero failures)
2. If anything fails, fix it first
3. Only then retry PR creation

This is a hard block — the command will not execute until you have verified both build and tests pass.
