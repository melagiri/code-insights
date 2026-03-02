# Session Context

## User Prompts

### Prompt 1

We enabled posthog recently for capturing errors and exceptions.. but looks like it is not working..

Log:
code-insights dashboard

   ____          _        ___           _       _     _
  / ___|___   __| | ___  |_ _|_ __  ___(_) __ _| |__ | |_ ___
 | |   / _ \ / _` |/ _ \  | || '_ \/ __| |/ _` | '_ \| __/ __|
 | |__| (_) | (_| |  __/  | || | | \__ \ | (_| | | | | |_\__ \
  \____\___/ \__,_|\___| |___|_| |_|___/_|\__, |_| |_|\__|___/
                                           |___/ v3.3.1

 ...

### Prompt 2

also, we may be need some additional data for these errors to pin point exact problem.. can we capture first few and last few lines of llm response to make our investigations better?

### Prompt 3

yes

### Prompt 4

Also, the dashboard cards aren't working properly.. the tool calls count and coding time shows 0. fix these 2 and also verify if others are showing values accurately

### Prompt 5

yes

### Prompt 6

[Request interrupted by user]

### Prompt 7

fix them all now. the current changes are not committed yet.. so create a fix branch and push all of them and then work on the newly identified issues as well in same branch.. let this be a test issues fix branch

### Prompt 8

I also think the 30d filter is a stretch, can we also introduce 7d filter and set that as default in dashboard and analytics page as well?

### Prompt 9

create a PR for all the changes and run a round of review

### Prompt 10

# /start-review — Triple-Layer Code Review Team

**PR**: 88

You are setting up a triple-layer code review for PR `88`. This can be used standalone or as part of a `/start-feature` team workflow.

---

## Step 1: Get PR Details

Fetch the PR details:

```bash
# Get the correct owner from git remote
git remote get-url origin | sed 's/.*[:/]\([^/]*\)\/[^/]*\.git/\1/'
```

Use `gh pr view 88` to get PR title, description, and diff stats.
Use `gh pr diff 88` to get the diff.

Determine the PR sco...

### Prompt 11

this is what posthog shows.. the stacktrace is missing as well

### Prompt 12

This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

Analysis:
Let me trace through the conversation chronologically:

1. **Initial request**: User reports PostHog is not capturing errors/exceptions properly. They show a log with a JSON parse error from the analysis pipeline that didn't generate anything on PostHog.

2. **Investigation**: I explored the PostHog integration across the codebase -...

### Prompt 13

I am also thinking we should improve the prompts.. We need users to use the tool for extracting long term learnings, decisions taken with proper context details not just single line decisions or insights without context.. Get the Prompts reviewed from llm expert persona agent to find improvements

### Prompt 14

but should we do it in a separate PR?

### Prompt 15

Merged

### Prompt 16

[Request interrupted by user]

### Prompt 17

yes

### Prompt 18

[Request interrupted by user]

### Prompt 19

sorry, continue

### Prompt 20

I am not sure if there are real insights people have created yet.. so, i don't mind not considering them and having option to re-generate if old format is found.. after a week or 2 we stop backward compatibility support

