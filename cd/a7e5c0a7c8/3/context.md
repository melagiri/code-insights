# Session Context

## User Prompts

### Prompt 1

You are performing an independent LLM EXPERT review of PR #297 in the code-insights repo. This is review ROUND 1.

Fetch the PR diff using: gh pr diff 297
Also fetch the PR details: gh pr view 297

Review all LLM-related code in server/src/llm/dispatch-prompts.ts and server/src/routes/dispatch.ts for:
- Prompt quality: clarity, specificity, output format constraints
- Token efficiency: redundant instructions, over-prompting, prompt stuffing
- Output consistency: structured output schemas, JSO...

