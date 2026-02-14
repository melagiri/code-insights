---
name: branch-discipline
enabled: true
event: all
action: warn
tool_matcher: Task
conditions:
  - field: subagent_type
    operator: regex_match
    pattern: (fullstack-engineer|ux-designer)
---

**Dev Agent Branch Check**

Before this agent writes any code, verify:

```bash
git branch  # Must show feature branch, NOT main
```

**If on main:** Create feature branch first with `git checkout -b feature/description`

**Rules:**
- Dev agents must NEVER commit directly to main
- All code goes to feature branches
- Every commit must be pushed immediately after creation
- Branch naming: `feature/description` or `fix/description`

**Pre-commit checklist:**
1. `git branch` — Am I on feature branch?
2. If on `main` → STOP, create feature branch
3. Commit to feature branch
4. Push immediately: `git push origin $(git branch --show-current)`
