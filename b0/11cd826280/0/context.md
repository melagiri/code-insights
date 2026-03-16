# Session Context

## User Prompts

### Prompt 1

We have recently added a lot of features. Audit the changes done till now from the release 3.6.1 and list down the plan here for packing it as v4.

### Prompt 2

Apart from this, we should also update the @README.md and @cli/README.md files.. include those changes and share your plan again

### Prompt 3

i wanted to use the release slash command.. verify if that command has this update of readme files included and if we run that, all the above stpes you mentioned will be taken care? If not, perform the changes that we need to explicitly make and then trigger the release command to do things that we already defined in the automated skill

### Prompt 4

why was it deleted?

### Prompt 5

yes

### Prompt 6

# /release — Automated Release Workflow

**Arguments**: major

You are executing the release workflow for `@code-insights/cli`. Parse `major` to extract:
- **type** (required): `patch`, `minor`, or `major`
- **description** (optional): A one-liner for the release title

If type is missing or not one of `patch`/`minor`/`major`, ask the user to provide it.

---

## Step 1: Pre-flight Checks

Run ALL of these checks. If any fail, STOP and tell the user what to fix.

```bash
# Must be on master
g...

### Prompt 7

Approved

### Prompt 8

proceed

