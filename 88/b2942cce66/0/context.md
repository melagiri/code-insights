# Session Context

## User Prompts

### Prompt 1

# /release — Automated Release Workflow

**Arguments**: minor

You are executing the release workflow for `@code-insights/cli`. Parse `minor` to extract:
- **type** (required): `patch`, `minor`, or `major`
- **description** (optional): A one-liner for the release title

If type is missing or not one of `patch`/`minor`/`major`, ask the user to provide it.

---

## Step 1: Pre-flight Checks

Run ALL of these checks. If any fail, STOP and tell the user what to fix.

```bash
# Must be on master
g...

### Prompt 2

You missed @README.md and @cli/README.md file again

### Prompt 3

approved

### Prompt 4

not just cli, run all tests

### Prompt 5

<bash-input>pnpm test</bash-input>

### Prompt 6

<bash-stdout>[2m Test Files [22m [1m[32m38 passed[39m[22m[90m (38)[39m
[2m      Tests [22m [1m[32m808 passed[39m[22m[90m (808)[39m</bash-stdout><bash-stderr></bash-stderr>

### Prompt 7

proceed

