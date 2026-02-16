---
name: cli-binary-name
enabled: true
event: all
action: warn
conditions:
  - field: content
    operator: regex_match
    pattern: \bclaudeinsight\s+(init|sync|connect|status|reset|install-hook|uninstall-hook)\b
---

**Wrong CLI Binary Name Detected!**

The CLI binary is **`code-insights`**, NOT `claudeinsight`.

**Correct usage:**
```bash
code-insights init
code-insights sync
code-insights connect
code-insights status
code-insights install-hook
code-insights uninstall-hook
code-insights reset
```

**Also note:**
- There is no `open` or `link` command. The correct command is `connect`.
- Package name is `code-insights`
- Config directory is `~/.code-insights/`

**Common mistakes:**
- ❌ `claudeinsight sync` → ✅ `code-insights sync`
- ❌ `claudeinsight open` → ✅ `code-insights connect`
- ❌ `codeinsight sync` → ✅ `code-insights sync`
