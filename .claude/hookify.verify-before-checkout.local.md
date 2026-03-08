---
name: verify-before-checkout
enabled: true
event: all
action: warn
tool_matcher: Bash
conditions:
  - field: command
    operator: regex_match
    pattern: git\s+(checkout|switch)\s+(?!-b)
---

**Pre-Checkout Verification**

Before checking out an existing branch, verify it exists:

```bash
git branch -a  # List all branches (local + remote)
```

**Never assume `main` vs `master`.** Detect the default branch dynamically:

```bash
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
```

**Rules:**
- Always verify the target branch exists before switching
- Use dynamic detection for the default branch — never hardcode `main` or `master`
- If the branch doesn't exist, check for typos or use `git checkout -b` to create it
