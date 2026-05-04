# Session Context

## User Prompts

### Prompt 1

I have many posthog errors, here is one such stacktrace:

{
  "uuid": "019df379-8c96-7171-9599-0845e7504847",
  "event": "$exception",
  "properties": {
    "$cymbal_errors": [
      "Invalid properties on event 019df379-8c96-7171-9599-0845e7504847, serde error: missing field `type`"
    ],
    "$exception_list": [
      {
        "mechanism": {
          "handled": true,
          "type": "generic"
        },
        "stacktrace": {
          "frames": [
            {
              "colno": ...

### Prompt 2

create feature branch and work on it.. but before that, try looking for similar errors that we may have introduced recently due the changes we made to codebase

### Prompt 3

ok, create PR and run a review and ask my final approval and PR merge

### Prompt 4

Base directory for this skill: /Users/melagiri/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/finishing-a-development-branch

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Ste...

