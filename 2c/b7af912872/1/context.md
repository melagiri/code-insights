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

### Prompt 8

linked post for this?

### Prompt 9

I want a narrative.. around why we did what we did..

### Prompt 10

i just release v4.5 fixing few more things.. can we blend that into this post draft and share.. i like the above draft

### Prompt 11

I am not going to talk about the audit and other things. From "the rest of these two .... hit them" part.. Remove it and rewrite

### Prompt 12

so, not adding anything? to make it engaging or seeking feedback?

### Prompt 13

instead of this: When you have 200+ AI coding sessions, browsing a list stops working. You know that insight exists somewhere, you remember reading it, but scrolling through pages isn't how you find it. 

Make it more engaging.. like you remember having an ai session on a particular feature but do not know full details.. and want to search that session to find what happened.. this way..

