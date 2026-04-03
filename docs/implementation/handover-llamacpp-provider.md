# Engineer Handover: llama.cpp Provider Integration

**GitHub Issue:** #267 — https://github.com/melagiri/code-insights/issues/267
**Branch:** `claude/plan-gemma-ollama-integration-03V9H`
**Date:** 2026-04-03
**Size:** XL (14 files, 3 new, cross-cutting across all three packages)

---

## What You Are Building

A new LLM provider called `llamacpp` that lets users run Code Insights' AI-powered session analysis against a locally running `llama-server` process (from the llama.cpp project). It uses the OpenAI-compatible HTTP API that llama-server exposes. No API key is required. The flagship local model is Gemma 4 12B (Q4_K_M GGUF).

This follows the same provider abstraction pattern as Ollama. Anywhere Ollama gets special treatment (free tier, no API key, local provider checks), llamacpp must receive identical treatment.

---

## File List and Changes

### cli/src/types.ts
Extend the `LLMProvider` union type:
```
'llamacpp'
```

### cli/src/constants/llm-providers.ts
- Add a llamacpp provider entry (display name, no API key required, base URL configurable)
- Add Gemma 4 model entries under the Ollama and Gemini sections

### cli/src/analysis/provider-runner.ts
- Add `makeLlamaCppChat` function (OpenAI-compatible HTTP call to llama-server)
- Skip the API key requirement check when provider is `llamacpp`
- **Tests required** (see Testing Requirements below)

### cli/src/commands/config.ts
- Add llamacpp to the interactive LLM provider wizard
- Prompt for base URL; default must be `http://localhost:8080`
- Do NOT prompt for an API key for llamacpp

### server/src/llm/providers/llamacpp.ts (NEW FILE)
- OpenAI-compatible HTTP client targeting llama-server
- Model discovery via `GET /v1/models` on the configured base URL
- Handle connection errors gracefully (llama-server may not be running)

### server/src/llm/client.ts
- Register llamacpp in the provider factory switch/map
- Include llamacpp in `isLLMConfigured` logic (it is configured if a base URL is set; no API key required)

### server/src/llm/analysis.ts
- Make `MAX_INPUT_TOKENS` model-aware — **this is a blocking requirement**
- For llamacpp: cap at **24,576 tokens** (24K)
- All existing hosted-model defaults must remain unchanged

### server/src/llm/analysis-pricing.ts
- Add `llamacpp: 0.00`

### server/src/routes/config.ts
- Add `'llamacpp'` to `VALID_PROVIDERS`
- Add a model discovery endpoint that proxies to `llama-server /v1/models`

### dashboard/src/lib/types.ts
- Add `'llamacpp'` to the provider union type (mirror of cli/src/types.ts)

### dashboard/src/lib/api.ts
- Add `fetchLlamaCppModels()` — calls the discovery endpoint added to server/src/routes/config.ts

### dashboard/src/lib/cost-utils.ts
- Add llamacpp to any free-provider check (alongside Ollama)

### dashboard/src/pages/SettingsPage.tsx
- Add a llamacpp provider section containing:
  - Model name text input (free-form, since models vary by user setup)
  - Base URL text input (default `http://localhost:8080`)
  - Model discovery button that calls `fetchLlamaCppModels` and populates the model input
- Note: this page has duplicated provider types — do not fix now, open a follow-up issue and leave a `// TODO` comment

### dashboard/src/components/sessions/AnalysisCostLine.tsx
- Handle free provider display for llamacpp (show $0.00 or "local" label, same as Ollama)

### dashboard/src/components/analysis/AnalyzeDropdown.tsx
- Include llamacpp in the local provider check (controls any "no API key needed" UI hints)

---

## Critical Fixes from Expert Reviews

These are not optional. The PR will not be approved without them.

### 1. MAX_INPUT_TOKENS must be model-aware (BLOCKING — LLM Expert)

File: `server/src/llm/analysis.ts`

The current global token limit is sized for large hosted models. Sending that many tokens to a 12B quantized model running in llama-server will cause failures or severely degraded output.

**Required:** convert `MAX_INPUT_TOKENS` from a constant to a function of provider + model. The llamacpp default is **24,576 (24K)**. All existing provider defaults must be unchanged.

### 2. Temperature 0.3 for llamacpp (LLM Expert)

File: `server/src/llm/providers/llamacpp.ts`

Global default temperature (0.7) produces inconsistent structured JSON output from small quantized models. Use **0.3** when provider is llamacpp.

### 3. Single retry on JSON parse failure for small-model providers (LLM Expert)

File: `server/src/llm/providers/llamacpp.ts` or `server/src/llm/analysis.ts`

Implement exactly **one** retry when a structural JSON parse failure occurs on a llamacpp call. Do not retry on every error type — only on parse failure.

### 4. Audit all `=== 'ollama'` checks (Technical Architect)

Before opening the PR, grep the entire codebase for `=== 'ollama'` (and `!== 'ollama'`, `includes('ollama')`, etc.). Every such check that controls free-tier, local, or no-API-key behavior must be updated to include `'llamacpp'`. This must be a complete audit — no half-updated provider checks.

```bash
grep -r "ollama" cli/src server/src dashboard/src --include="*.ts" --include="*.tsx" -l
```

---

## Testing Requirements

Vitest unit tests are required for `cli/src/analysis/provider-runner.ts`. Cover:

1. **Happy path:** `makeLlamaCppChat` sends a well-formed request to the configured base URL and returns parsed content
2. **API key skip:** no API key error is thrown when provider is `llamacpp`
3. **Base URL configuration:** the function uses the configured base URL, not a hardcoded default

Test file: `cli/src/analysis/__tests__/provider-runner.test.ts` (or alongside the existing test structure — check `docs/QA.md` for conventions).

---

## Pre-PR Gate

Before creating the PR, from the repo root:

```bash
pnpm build
```

Zero errors required. If anything fails, fix it before opening the PR.

---

## Tech Debt to Track Before Closing #267

Open a separate issue (can be done while the PR is in review) for:

1. **Duplicated provider types in SettingsPage.tsx** — the page re-declares types that live in `dashboard/src/lib/types.ts`
2. **Simplified prompts for 12B quantized models** — the full facet extraction prompt is optimized for large models; a stripped-down version for small local models would improve output quality (LLM Expert recommendation, not required for this PR)

---

## Definition of Done

- [ ] `pnpm build` passes from repo root with zero errors
- [ ] All 14 files modified/created per the file list above
- [ ] All four expert-required fixes implemented
- [ ] `=== 'ollama'` audit complete, llamacpp co-located in every check
- [ ] Vitest tests for `makeLlamaCppChat` written and passing
- [ ] PR created against `claude/plan-gemma-ollama-integration-03V9H`
- [ ] PR body references issue #267
- [ ] Follow-up tech debt issues opened
- [ ] Triple-layer review initiated (TA insider + outsider + synthesis)
