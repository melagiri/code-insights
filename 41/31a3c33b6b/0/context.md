# Session Context

## User Prompts

### Prompt 1

# /release — Automated Release Workflow

**Arguments**: patch

You are executing the release workflow for `@code-insights/cli`. Parse `patch` to extract:
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

approved

### Prompt 3

proceed

