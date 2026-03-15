# /start-feature — Auto-Setup Feature Development Team

**Feature**: $ARGUMENTS

You are setting up a hybrid agent team for feature development. The PM agent leads the team and owns the ceremony. Your job is minimal setup, then hand control to PM.

---

## Step 1: Create Git Worktree

Slugify the feature description into a branch name:
- Take `$ARGUMENTS`, lowercase it, replace spaces/special chars with hyphens, truncate to 50 chars
- Prefix with `feature/` (e.g., "add demo mode onboarding" -> `feature/add-demo-mode-onboarding`)

```bash
# Example (adapt the slug from $ARGUMENTS):
BRANCH_NAME="feature/<slugified-arguments>"
git fetch origin
git worktree add ../code-insights-${BRANCH_NAME#feature/} -b ${BRANCH_NAME} origin/main
```

If the worktree or branch already exists, inform the user and ask how to proceed.

Run `pnpm install` in the worktree:
```bash
cd ../code-insights-${BRANCH_NAME#feature/} && pnpm install
```

---

## Step 2: Create Named Team

Create the team using TeamCreate. Use the slugified branch name (without `feature/` prefix) as the team name:

```
TeamCreate {
  team_name: "feat-<slugified-arguments>",
  description: "Feature team: $ARGUMENTS"
}
```

---

## Step 3: Spawn PM Agent

The PM agent handles scoping, GitHub Issues, and task graph creation. It does NOT spawn other agents — only the orchestrator can spawn agents.

```
Task {
  name: "pm-agent",
  subagent_type: "product-manager",
  team_name: "feat-<slugified-arguments>",
  prompt: "You are the PM for this feature team.

FEATURE REQUEST: $ARGUMENTS
WORKTREE: ../code-insights-<slugified-arguments>/
BRANCH: feature/<slugified-arguments>
TEAM: feat-<slugified-arguments>

Your responsibilities are scoping, GitHub Issues, task graph, and handoff preparation.
IMPORTANT: You CANNOT spawn agents. Only the orchestrator can. When you need an agent spawned, message the orchestrator with the request.

Follow this protocol:

1. SCOPE: Read docs in docs/ and CLAUDE.md to understand what this feature involves. Check for existing design docs in docs/plans/. Check docs/architecture/ for architecture context. If the scope is unclear, message the orchestrator for clarification.

2. ISSUES: Search for an existing GitHub Issue that matches this feature. If one exists, use it. If not, create one with proper description, acceptance criteria, and T-shirt size. Record the issue number.

3. TASK GRAPH: Create the ceremony tasks using TaskCreate, then set dependencies with TaskUpdate:
   - Task: 'TA: Review architecture alignment' (no dependencies) -- SKIP if internal-only (new components, UI, styling)
   - Task: 'LLM Expert: Design prompt architecture' (no dependencies) -- SKIP if feature doesn't involve LLM calls
   - Task: 'PM: Prepare handoff context in GitHub Issue' (no dependencies, you do this yourself)
   - Task: 'Dev: Read handoff and design docs, prepare questions' (blockedBy: TA + LLM Expert if applicable + PM handoff)
   - Task: 'Dev + TA: Reach consensus on implementation approach' (blockedBy: above) -- SKIP if internal-only
   - Task: 'Dev: Implement feature in worktree' (blockedBy: above)
   - Task: 'Dev: Create PR and run CI checks' (blockedBy: above)
   - Task: 'Review: Triple-layer code review' (blockedBy: above)
   - Task: 'Post review summary to GitHub PR' (blockedBy: above)

4. DO YOUR OWN TASK: Work on your handoff task -- prepare context in the GitHub Issue (description, acceptance criteria, relevant doc paths, implementation guidance).

5. REQUEST AGENT SPAWNS: When your handoff task is done, message the orchestrator:
   - If TA is needed: 'SPAWN_REQUEST: ta-agent — [brief context]'
   - When dev prerequisites are met: 'SPAWN_REQUEST: dev-agent — [brief context including issue number and key details]'
   The orchestrator will spawn the agents and assign tasks.

   SKIP TA if the feature is internal-only (new components, UI fixes, styling, LLM provider additions). In that case, mark the TA task as completed with note 'Skipped -- internal-only change'.

   If the feature involves LLM calls (prompts, model selection, token budgets, structured output):
   - 'SPAWN_REQUEST: llm-expert-agent — [brief context about the LLM aspect]'
   The LLM Expert will design the prompt architecture, token budget, and model recommendation before dev implements.

   SKIP LLM Expert if the feature doesn't touch LLM code. Mark the task as completed with note 'Skipped -- no LLM impact'.

6. MONITOR: Check TaskList periodically. When Dev creates a PR, message the orchestrator to trigger /start-review on the PR number.

7. REPORT: When review is posted, message the orchestrator: 'PR #XX for $ARGUMENTS is ready for founder review and merge.'

IMPORTANT RULES:
- NEVER merge PRs -- founder-only
- NEVER try to spawn agents -- message the orchestrator instead
- All dev work happens in the worktree
- If you need user clarification, message the orchestrator who will ask the user
- You can message existing teammates directly via SendMessage for routine coordination
- Task dependencies enforce ceremony order -- don't skip steps
- PRE-PR GATE (MANDATORY): Before any PR is created, `pnpm build` must pass from the repo root with zero errors. If it fails, dev fixes before creating the PR. GitHub Actions costs money — failed CI runs are wasted spend.",
  mode: "bypassPermissions"
}
```

---

## Step 4: Orchestrator Spawns Agents on PM Request

After PM completes its handoff and sends a SPAWN_REQUEST message, the orchestrator spawns the requested agent:

**For TA (if PM requests it):**
```
Task {
  name: "ta-agent",
  subagent_type: "technical-architect",
  team_name: "feat-<slugified-arguments>",
  prompt: "You are the TA for feature team feat-<slugified-arguments>. Feature: $ARGUMENTS. Check TaskList for your assigned tasks. Use SendMessage to communicate with pm-agent and later dev-agent. Mark tasks in_progress when starting, completed when done.",
  mode: "bypassPermissions"
}
```
Assign the TA task to ta-agent.

**For LLM Expert (if PM requests it):**
```
Task {
  name: "llm-expert-agent",
  subagent_type: "llm-expert",
  team_name: "feat-<slugified-arguments>",
  prompt: "You are the LLM Expert for feature team feat-<slugified-arguments>. Feature: $ARGUMENTS. Check TaskList for your assigned tasks. Design the prompt architecture, token budget, model recommendation, and output schema for the LLM aspects of this feature. Use SendMessage to communicate with pm-agent and ta-agent. Mark tasks in_progress when starting, completed when done.",
  mode: "bypassPermissions"
}
```
Assign the LLM Expert task to llm-expert-agent.

**For Dev (when PM requests it):**
```
Task {
  name: "dev-agent",
  subagent_type: "engineer",
  team_name: "feat-<slugified-arguments>",
  prompt: "You are the Dev for feature team feat-<slugified-arguments>. Feature: $ARGUMENTS. Worktree: ../code-insights-<slugified-arguments>/. All code work happens in the worktree. Check TaskList for your tasks. Use SendMessage to communicate with pm-agent. Mark tasks in_progress/completed. PRE-PR GATE (MANDATORY): Before creating any PR, run `pnpm build` from the repo root and verify zero errors. If it fails, fix before creating the PR. This is non-negotiable — failed CI runs waste money.",
  mode: "bypassPermissions"
}
```
Assign the next unblocked dev task to dev-agent.

---

## Step 5: Supervise

After spawning agents, your role is active supervisor:

1. **PM handles scoping and task graph** — orchestrator handles all agent spawning
2. **Spawn agents when PM sends SPAWN_REQUEST messages**
3. **Intervene when**:
   - PM messages you asking for user clarification -> relay to user
   - An agent is stuck or reports a blocker -> help unblock
   - PM requests `/start-review` -> run the review command on the PR
4. **When PM reports "ready for merge"** -> inform the user

---

## Step 5: Cleanup (After PR Merge)

After the founder merges the PR:

1. Send shutdown requests to all teammates (pm-agent, ta-agent, dev-agent)
2. Delete the team: `TeamDelete`
3. Clean up worktree:
```bash
git worktree remove ../code-insights-<slugified-arguments>
```
4. Confirm cleanup is complete

---

## Important Rules

- **NEVER merge the PR** — founder-only
- **Only the orchestrator spawns agents** — sub-agents CANNOT use the Task tool to spawn teammates. PM must send SPAWN_REQUEST messages to the orchestrator.
- **PM handles scoping and coordination** — it creates task graphs, GitHub Issues, and prepares handoff context
- **Orchestrator is the agent factory** — spawns TA and Dev agents when PM requests them
- **All dev work happens in the worktree**
- **Task dependencies enforce ceremony order** — agents can't skip steps
- **TA is optional** for internal-only changes — PM decides based on scope
