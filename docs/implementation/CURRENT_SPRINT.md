# Current Sprint: llama.cpp Provider Integration

**Started:** 2026-04-03
**Goal:** Add llama.cpp as a local LLM provider so users can run fully-local, free session analysis via llama-server + GGUF models (Gemma 4 flagship).

**GitHub Issue:** #267 — https://github.com/melagiri/code-insights/issues/267
**Branch:** `claude/plan-gemma-ollama-integration-03V9H`

---

## In Progress

- [ ] Phase 1: Extend LLMProvider type union -- engineer -- S -- claude/plan-gemma-ollama-integration-03V9H
- [ ] Phase 2: Provider metadata + pricing constants -- engineer -- S
- [ ] Phase 3: Server provider implementation (llamacpp.ts NEW) -- engineer -- M
- [ ] Phase 4: CLI provider runner -- engineer -- M
- [ ] Phase 5: Config wizard -- engineer -- S
- [ ] Phase 6: Server routes (VALID_PROVIDERS + discovery endpoint) -- engineer -- S
- [ ] Phase 7: Dashboard UI (Settings, cost display, dropdown) -- engineer -- L
- [ ] Phase 8: LLM Expert required fixes (token limits, temperature, retry) -- engineer -- M

## Done

## Blocked

## Next Up

- [ ] Triple-layer review once PR is created -- TA + outsider -- S
- [ ] Follow-up issue: simplified prompts for 12B quantized models -- PM -- S
- [ ] Follow-up issue: SettingsPage duplicated provider types -- PM -- S
