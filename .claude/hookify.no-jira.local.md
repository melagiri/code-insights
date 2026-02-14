---
name: no-jira
enabled: true
event: all
action: block
conditions:
  - field: content
    operator: regex_match
    pattern: (createJiraIssue|jira_create_issue|atlassian\.net|batonship\.atlassian|ENGG-\d+)
---

**Jira Not Available**

This project does **NOT** use Jira. Do NOT call Jira/Atlassian APIs.

**Use instead:**
- **GitHub Issues**: `gh issue create`, `gh issue list`
- **Local tracking**: `docs/implementation/CURRENT_SPRINT.md`

This is a hard block — Jira API calls will not execute.
