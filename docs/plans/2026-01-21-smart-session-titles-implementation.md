# Smart Session Titles & Insight Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate "Untitled Session" by generating smart titles based on session content, and fix garbled insight rendering.

**Architecture:** CLI generates titles during sync using a specificity-scoring system. Titles come from: Claude summary > user message > insights > session character > fallback. Insights get structured parsing to extract clean title/summary/bullets.

**Tech Stack:** TypeScript, Node.js CLI, Next.js web components

---

## Task 1: Add Types for Title Generation

**Files:**
- Modify: `cli/src/types.ts`

**Step 1: Add new types to cli/src/types.ts**

Add after line 62 (after `ParsedMessage` interface):

```typescript
export type SessionCharacter =
  | 'deep_focus'    // 50+ messages, concentrated file work
  | 'bug_hunt'      // Error patterns + fixes
  | 'feature_build' // Multiple new files created
  | 'exploration'   // Heavy Read/Grep, few edits
  | 'refactor'      // Many edits, same file count
  | 'learning'      // Questions and explanations
  | 'quick_task';   // <10 messages, completed

export type TitleSource = 'claude' | 'user_message' | 'insight' | 'character' | 'fallback';

export interface TitleCandidate {
  text: string;
  source: TitleSource;
  score: number;
}

export interface GeneratedTitle {
  title: string;
  source: TitleSource;
  character: SessionCharacter | null;
}
```

**Step 2: Update ParsedSession interface**

Modify the `ParsedSession` interface to add title fields (around line 48):

```typescript
export interface ParsedSession {
  id: string;
  projectPath: string;
  projectName: string;
  summary: string | null;
  // New fields for smart titles
  generatedTitle: string | null;
  titleSource: TitleSource | null;
  sessionCharacter: SessionCharacter | null;
  // Existing fields
  startedAt: Date;
  endedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  gitBranch: string | null;
  claudeVersion: string | null;
  messages: ParsedMessage[];
}
```

**Step 3: Commit**

```bash
cd /Users/melagiri/Workspace/claudeInsights/.worktrees/smart-titles
git add cli/src/types.ts
git commit -m "feat(types): add session title and character types"
```

---

## Task 2: Create Title Generation Module

**Files:**
- Create: `cli/src/parser/titles.ts`

**Step 1: Create the titles.ts file**

```typescript
import type {
  ParsedSession,
  ParsedMessage,
  SessionCharacter,
  TitleSource,
  TitleCandidate,
  GeneratedTitle,
  Insight,
} from '../types.js';

// Skip patterns - generic responses that make poor titles
const SKIP_PATTERNS = [
  /^(yes|no|ok|okay|sure|thanks|thank you|continue|go ahead|sounds good|looks good|perfect|great|nice|cool|done|got it)\.?$/i,
  /^(y|n|k)$/i,
  /^```/,  // Code blocks
];

// Prefixes to remove from titles
const PREFIX_REMOVALS = [
  /^(help me|can you|could you|please|i want to|i need to|i'd like to|let's)\s+/i,
  /^(hi|hello|hey),?\s*/i,
];

// Action verbs that indicate good title candidates
const ACTION_VERBS = /^(fix|add|create|build|implement|update|remove|delete|refactor|move|rename|change|modify|setup|configure|install|debug|test|write|make|get|set|find|search|check|review|analyze|optimize|improve|migrate|convert|integrate)/i;

/**
 * Generate a smart title for a session
 */
export function generateTitle(
  session: ParsedSession,
  insights: Insight[]
): GeneratedTitle {
  // 1. If Claude Code provided a summary, use it
  if (session.summary && session.summary.trim().length > 0) {
    return {
      title: cleanTitle(session.summary),
      source: 'claude',
      character: null,
    };
  }

  // 2. Collect title candidates
  const candidates: TitleCandidate[] = [];

  // From first user message
  const userMessageCandidate = extractFromUserMessage(session.messages);
  if (userMessageCandidate) {
    candidates.push(userMessageCandidate);
  }

  // From insights
  const insightCandidates = extractFromInsights(insights);
  candidates.push(...insightCandidates);

  // 3. Select best candidate (threshold >= 40)
  const bestCandidate = candidates
    .filter(c => c.score >= 40)
    .sort((a, b) => b.score - a.score)[0];

  if (bestCandidate) {
    return {
      title: cleanTitle(bestCandidate.text),
      source: bestCandidate.source,
      character: null,
    };
  }

  // 4. Try session character-based title
  const character = detectSessionCharacter(session);
  if (character) {
    const characterTitle = generateCharacterTitle(session, character);
    return {
      title: characterTitle,
      source: 'character',
      character,
    };
  }

  // 5. Fallback
  return {
    title: `${session.projectName} session (${session.messageCount} messages)`,
    source: 'fallback',
    character: null,
  };
}

/**
 * Extract title candidate from first meaningful user message
 */
function extractFromUserMessage(messages: ParsedMessage[]): TitleCandidate | null {
  // Find first user message that isn't a skip pattern
  const userMessages = messages.filter(m => m.type === 'user');

  for (const msg of userMessages.slice(0, 3)) {  // Check first 3 user messages
    const content = msg.content.trim();

    // Skip if matches skip patterns
    if (SKIP_PATTERNS.some(p => p.test(content))) {
      continue;
    }

    // Skip if too short
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 3) {
      continue;
    }

    // Skip if too long (take first sentence or 50 words)
    let text = content;
    if (wordCount > 50) {
      const firstSentence = content.split(/[.!?]/)[0];
      text = firstSentence.length > 10 ? firstSentence : content.split(/\s+/).slice(0, 20).join(' ');
    }

    // Score the candidate
    const score = scoreUserMessage(text);
    if (score > 0) {
      return { text, source: 'user_message', score };
    }
  }

  return null;
}

/**
 * Score a user message for title quality
 */
function scoreUserMessage(text: string): number {
  const wordCount = text.split(/\s+/).length;

  // Too short or too long
  if (wordCount < 3) return 0;
  if (wordCount > 100) return 0;

  // Contains action verb - strong signal
  if (ACTION_VERBS.test(text)) {
    if (wordCount >= 5 && wordCount <= 15) return 80;
    if (wordCount > 15 && wordCount <= 30) return 70;
    return 60;
  }

  // Question about specific topic
  if (text.includes('?')) {
    if (wordCount >= 5 && wordCount <= 20) return 70;
    return 50;
  }

  // Short but meaningful
  if (wordCount >= 5 && wordCount <= 15) return 60;

  // Medium length
  if (wordCount > 15 && wordCount <= 50) return 40;

  // Long - penalize
  return 20;
}

/**
 * Extract title candidates from insights
 */
function extractFromInsights(insights: Insight[]): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (const insight of insights) {
    // Skip effort insights - not good for titles
    if (insight.type === 'effort') continue;

    const title = insight.title;

    // Skip generic workitem titles
    if (insight.type === 'workitem' && /^\w+:\s*\d+\s*file/.test(title)) {
      candidates.push({ text: title, source: 'insight', score: 10 });
      continue;
    }

    // Decision insights with clear subject
    if (insight.type === 'decision') {
      candidates.push({ text: title, source: 'insight', score: 85 });
      continue;
    }

    // Workitem with specific context
    if (insight.type === 'workitem' && insight.metadata?.files?.length) {
      const file = insight.metadata.files[0].split('/').pop() || '';
      const workType = insight.metadata.workType || 'feature';
      candidates.push({
        text: `${capitalize(workType)}: ${file}`,
        source: 'insight',
        score: 75,
      });
      continue;
    }

    // Learning insight
    if (insight.type === 'learning') {
      candidates.push({ text: title, source: 'insight', score: 65 });
    }
  }

  return candidates;
}

/**
 * Detect the session's character based on patterns
 */
export function detectSessionCharacter(session: ParsedSession): SessionCharacter | null {
  const { messages, toolCallCount, messageCount } = session;

  // Count tool calls by type
  const toolCounts: Record<string, number> = {};
  const filesModified = new Set<string>();
  const filesCreated = new Set<string>();

  for (const msg of messages) {
    for (const tc of msg.toolCalls) {
      toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;

      if (tc.name === 'Edit' || tc.name === 'Write') {
        const filePath = tc.input?.file_path as string | undefined;
        if (filePath) {
          filesModified.add(filePath);
          if (tc.name === 'Write') {
            filesCreated.add(filePath);
          }
        }
      }
    }
  }

  const editCount = (toolCounts['Edit'] || 0) + (toolCounts['Write'] || 0);
  const readCount = (toolCounts['Read'] || 0) + (toolCounts['Grep'] || 0) + (toolCounts['Glob'] || 0);

  // Detection rules (order matters - more specific first)

  // Deep focus: 50+ messages, concentrated on few files
  if (messageCount >= 50 && filesModified.size <= 3 && filesModified.size > 0) {
    return 'deep_focus';
  }

  // Bug hunt: error patterns in content + fixes
  const hasErrorPatterns = messages.some(m =>
    /error|bug|fix|issue|broken|fail/i.test(m.content)
  );
  const hasFix = messages.some(m =>
    /fixed|resolved|working now/i.test(m.content)
  );
  if (hasErrorPatterns && hasFix && editCount > 0) {
    return 'bug_hunt';
  }

  // Feature build: multiple new files created
  if (filesCreated.size >= 3) {
    return 'feature_build';
  }

  // Exploration: heavy reading, few edits
  if (readCount > editCount * 3 && editCount < 5) {
    return 'exploration';
  }

  // Refactor: many edits, no new files
  if (editCount > 10 && filesCreated.size === 0) {
    return 'refactor';
  }

  // Learning: lots of questions, few tool calls
  const questionCount = messages.filter(m =>
    m.type === 'user' && m.content.includes('?')
  ).length;
  if (questionCount >= 3 && toolCallCount < messageCount) {
    return 'learning';
  }

  // Quick task: short session with some edits
  if (messageCount < 10 && editCount > 0) {
    return 'quick_task';
  }

  return null;
}

/**
 * Generate title based on session character
 */
function generateCharacterTitle(
  session: ParsedSession,
  character: SessionCharacter
): string {
  // Get primary file (most edited)
  const fileCounts: Record<string, number> = {};
  for (const msg of session.messages) {
    for (const tc of msg.toolCalls) {
      if (tc.name === 'Edit' || tc.name === 'Write') {
        const filePath = tc.input?.file_path as string | undefined;
        if (filePath) {
          const fileName = filePath.split('/').pop() || filePath;
          fileCounts[fileName] = (fileCounts[fileName] || 0) + 1;
        }
      }
    }
  }
  const primaryFile = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'files';

  // Get topic from user messages
  const userContent = session.messages
    .filter(m => m.type === 'user')
    .map(m => m.content)
    .join(' ')
    .toLowerCase();

  const topic = extractTopic(userContent) || session.projectName;

  switch (character) {
    case 'deep_focus':
      return `Deep work: ${primaryFile}`;
    case 'bug_hunt':
      return `Fixed: ${extractBugDescription(session.messages) || primaryFile}`;
    case 'feature_build':
      return `Built: ${topic}`;
    case 'exploration':
      return `Explored: ${topic}`;
    case 'refactor':
      return `Refactored: ${primaryFile}`;
    case 'learning':
      return `Learned: ${topic}`;
    case 'quick_task':
      return `Updated: ${primaryFile}`;
    default:
      return `${session.projectName} session`;
  }
}

/**
 * Extract a topic from user content
 */
function extractTopic(content: string): string | null {
  // Look for common topic indicators
  const patterns = [
    /(?:about|for|with|using)\s+([a-z][a-z0-9\s-]{2,20})/i,
    /([a-z][a-z0-9\s-]{2,15})\s+(?:feature|component|module|function|api)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract bug description from messages
 */
function extractBugDescription(messages: ParsedMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === 'user') {
      const match = msg.content.match(/(?:fix|bug|error|issue)[:\s]+([^.!?\n]{5,40})/i);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return null;
}

/**
 * Clean and format a title
 */
export function cleanTitle(raw: string): string {
  let title = raw;

  // Remove common prefixes
  for (const pattern of PREFIX_REMOVALS) {
    title = title.replace(pattern, '');
  }

  // Strip markdown formatting
  title = title.replace(/[*_`#]/g, '');

  // Collapse whitespace
  title = title.replace(/\s+/g, ' ').trim();

  // Truncate to 60 characters
  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return title;
}

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

**Step 2: Commit**

```bash
git add cli/src/parser/titles.ts
git commit -m "feat(parser): add smart title generation module

- Extracts titles from user messages with specificity scoring
- Detects session character (deep_focus, bug_hunt, etc.)
- Generates character-based template titles
- Falls back to project name + message count"
```

---

## Task 3: Integrate Title Generation into Parser

**Files:**
- Modify: `cli/src/parser/jsonl.ts`

**Step 1: Add import for title generation**

Add at the top with other imports (after line 11):

```typescript
import { generateTitle } from './titles.js';
import { extractInsights } from './insights.js';
```

**Step 2: Update buildSession function**

In the `buildSession` function, update the return statement (around line 102-117) to include title generation:

```typescript
  // Generate insights first (needed for title generation)
  const tempSession: ParsedSession = {
    id: sessionId,
    projectPath,
    projectName,
    summary,
    generatedTitle: null,
    titleSource: null,
    sessionCharacter: null,
    startedAt,
    endedAt,
    messageCount: parsedMessages.length,
    userMessageCount,
    assistantMessageCount,
    toolCallCount,
    gitBranch,
    claudeVersion,
    messages: parsedMessages,
  };

  // Extract insights for title generation
  const insights = extractInsights(tempSession);

  // Generate smart title
  const titleResult = generateTitle(tempSession, insights);

  return {
    ...tempSession,
    generatedTitle: titleResult.title,
    titleSource: titleResult.source,
    sessionCharacter: titleResult.character,
  };
```

**Step 3: Commit**

```bash
git add cli/src/parser/jsonl.ts
git commit -m "feat(parser): integrate title generation into session parsing"
```

---

## Task 4: Add Structured Insight Parsing

**Files:**
- Modify: `cli/src/types.ts`
- Modify: `cli/src/parser/insights.ts`

**Step 1: Add structured insight types to types.ts**

Add after the `GeneratedTitle` interface:

```typescript
export interface ParsedInsightContent {
  title: string;
  summary: string;
  bullets: string[];
  rawContent: string;
}
```

Update the `Insight` interface to include new fields:

```typescript
export interface Insight {
  id: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  type: 'decision' | 'learning' | 'workitem' | 'effort';
  title: string;
  content: string;
  // New structured fields
  summary: string;
  bullets: string[];
  // Existing fields
  confidence: number;
  source: 'pattern' | 'llm' | 'claude_insight';
  metadata: InsightMetadata;
  timestamp: Date;
}
```

**Step 2: Add insight content parsing to insights.ts**

Add after the imports (around line 3):

```typescript
import type { ParsedInsightContent } from '../types.js';

/**
 * Parse and clean insight content, handling Claude Code formatting
 */
export function parseInsightContent(raw: string): ParsedInsightContent {
  // Detect Claude Code formatted insight
  const isClaudeInsight = raw.includes('★ Insight') || raw.includes('★Insight');

  if (isClaudeInsight) {
    return parseClaudeFormattedInsight(raw);
  }

  return parseGenericContent(raw);
}

/**
 * Parse Claude Code's formatted insight blocks
 */
function parseClaudeFormattedInsight(raw: string): ParsedInsightContent {
  // Remove the ★ Insight header and decorative lines
  let cleaned = raw
    .replace(/★\s*Insight\s*─*/g, '')
    .replace(/─+/g, '')
    .replace(/\*\*/g, '')  // Remove bold markers
    .trim();

  // Split into lines and filter empty
  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);

  // First non-empty line is the title
  const titleLine = lines[0] || '';
  const title = titleLine.replace(/:$/, '').trim();

  // Extract bullets (lines starting with -)
  const bullets = lines
    .slice(1)
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim());

  // Summary is title + first bullet if exists
  const summary = bullets.length > 0
    ? `${title}: ${bullets[0]}`
    : title;

  return { title, summary, bullets, rawContent: raw };
}

/**
 * Parse generic content (non-Claude-formatted)
 */
function parseGenericContent(raw: string): ParsedInsightContent {
  // Clean markdown and escape sequences
  let cleaned = raw
    .replace(/\*\*/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .trim();

  // Get first line as title
  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);
  const title = truncate(lines[0] || cleaned, 100);

  // Extract any bullets
  const bullets = lines
    .slice(1)
    .filter(l => l.startsWith('-') || l.startsWith('•'))
    .map(l => l.replace(/^[-•]\s*/, '').trim());

  const summary = title;

  return { title, summary, bullets, rawContent: raw };
}
```

**Step 3: Update insight extraction functions to use structured parsing**

Update `extractDecisions` function to include structured fields (around line 76):

```typescript
function extractDecisions(
  message: ParsedMessage,
  session: ParsedSession,
  projectId: string
): Insight[] {
  const insights: Insight[] = [];
  const content = message.content;

  for (const pattern of DECISION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const extractedText = match[1] || match[0];

      // Get surrounding context (up to 200 chars)
      const matchIndex = content.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 100);
      const contextEnd = Math.min(content.length, matchIndex + match[0].length + 100);
      const context = content.slice(contextStart, contextEnd);

      // Parse the content for structure
      const parsed = parseInsightContent(context);

      insights.push({
        id: uuidv4(),
        sessionId: session.id,
        projectId,
        projectName: session.projectName,
        type: 'decision',
        title: parsed.title || truncate(extractedText, 100),
        content: context,
        summary: parsed.summary,
        bullets: parsed.bullets,
        confidence: 0.7,
        source: 'pattern',
        metadata: {
          reasoning: extractedText,
        },
        timestamp: message.timestamp,
      });

      break;
    }
  }

  return insights;
}
```

Similarly update `extractLearnings` and `extractWorkItems` to include `summary: ''` and `bullets: []` fields.

**Step 4: Commit**

```bash
git add cli/src/types.ts cli/src/parser/insights.ts
git commit -m "feat(parser): add structured insight parsing

- Parses Claude Code ★ Insight formatted blocks
- Extracts title, summary, and bullets
- Cleans markdown and escape sequences"
```

---

## Task 5: Update Web Types

**Files:**
- Modify: `web/src/lib/types.ts`

**Step 1: Update Session interface**

Add new fields to Session interface (after line 17):

```typescript
export interface Session {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  summary: string | null;
  // New title fields
  generatedTitle: string | null;
  titleSource: 'claude' | 'user_message' | 'insight' | 'character' | 'fallback' | null;
  sessionCharacter: 'deep_focus' | 'bug_hunt' | 'feature_build' | 'exploration' | 'refactor' | 'learning' | 'quick_task' | null;
  // Existing fields
  startedAt: Date;
  endedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  gitBranch: string | null;
  claudeVersion: string | null;
  syncedAt: Date;
}
```

**Step 2: Update Insight interface**

Add structured fields to Insight interface (after line 36):

```typescript
export interface Insight {
  id: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  type: 'decision' | 'learning' | 'workitem' | 'effort';
  title: string;
  content: string;
  // New structured fields
  summary: string;
  bullets: string[];
  // Existing fields
  confidence: number;
  source: 'pattern' | 'llm' | 'claude_insight';
  metadata: InsightMetadata;
  timestamp: Date;
  createdAt: Date;
}
```

**Step 3: Commit**

```bash
git add web/src/lib/types.ts
git commit -m "feat(web): update types for smart titles and structured insights"
```

---

## Task 6: Update SessionCard Component

**Files:**
- Modify: `web/src/components/sessions/SessionCard.tsx`

**Step 1: Update the title display**

Replace line 26 (`{session.summary || 'Untitled Session'}`) with:

```tsx
{session.summary || session.generatedTitle || 'Untitled Session'}
```

**Step 2: Add session character badge (optional enhancement)**

Add after the project name (line 29), inside the `<div className="space-y-1">`:

```tsx
<div className="flex items-center gap-2">
  <p className="text-sm text-muted-foreground">
    {session.projectName}
  </p>
  {session.sessionCharacter && (
    <Badge variant="secondary" className="text-xs capitalize">
      {session.sessionCharacter.replace('_', ' ')}
    </Badge>
  )}
</div>
```

**Step 3: Commit**

```bash
git add web/src/components/sessions/SessionCard.tsx
git commit -m "feat(web): update SessionCard to use smart titles

- Falls back through summary -> generatedTitle -> 'Untitled Session'
- Shows session character badge when available"
```

---

## Task 7: Update InsightCard Component

**Files:**
- Modify: `web/src/components/insights/InsightCard.tsx`

**Step 1: Update content rendering to use structured fields**

Replace line 61 (`<p className="text-sm text-muted-foreground line-clamp-3">{insight.content}</p>`) with:

```tsx
{insight.bullets && insight.bullets.length > 0 ? (
  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
    {insight.bullets.slice(0, 3).map((bullet, i) => (
      <li key={i} className="line-clamp-1">{bullet}</li>
    ))}
    {insight.bullets.length > 3 && (
      <li className="text-muted-foreground/70">
        +{insight.bullets.length - 3} more...
      </li>
    )}
  </ul>
) : (
  <p className="text-sm text-muted-foreground line-clamp-3">
    {insight.summary || insight.content}
  </p>
)}
```

**Step 2: Commit**

```bash
git add web/src/components/insights/InsightCard.tsx
git commit -m "feat(web): update InsightCard to render structured content

- Renders bullets as list when available
- Falls back to summary then content
- Shows max 3 bullets with overflow indicator"
```

---

## Task 8: Update Session Detail Page

**Files:**
- Modify: `web/src/app/sessions/[id]/page.tsx`

**Step 1: Update the title display**

Find line 63 (or the line with `{session.summary || 'Untitled Session'}`) and replace with:

```tsx
{session.summary || session.generatedTitle || 'Untitled Session'}
```

**Step 2: Commit**

```bash
git add web/src/app/sessions/\[id\]/page.tsx
git commit -m "feat(web): update session detail page to use smart titles"
```

---

## Task 9: Add --regenerate-titles Flag to Sync Command

**Files:**
- Modify: `cli/src/commands/sync.ts`
- Modify: `cli/src/index.ts`

**Step 1: Update SyncOptions interface in sync.ts**

Add to the interface (around line 12):

```typescript
interface SyncOptions {
  force?: boolean;
  project?: string;
  includeMessages?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
  regenerateTitles?: boolean;  // New option
}
```

**Step 2: Update CLI entry point to include the flag**

In `cli/src/index.ts`, find the sync command definition and add:

```typescript
.option('--regenerate-titles', 'Regenerate titles for all sessions')
```

**Step 3: Commit**

```bash
git add cli/src/commands/sync.ts cli/src/index.ts
git commit -m "feat(cli): add --regenerate-titles flag to sync command"
```

---

## Task 10: Build and Test

**Step 1: Build CLI**

```bash
cd /Users/melagiri/Workspace/claudeInsights/.worktrees/smart-titles/cli
pnpm build
```

**Step 2: Build Web**

```bash
cd /Users/melagiri/Workspace/claudeInsights/.worktrees/smart-titles/web
pnpm build
```

**Step 3: Test locally**

```bash
# Link CLI for testing
cd /Users/melagiri/Workspace/claudeInsights/.worktrees/smart-titles/cli
npm link

# Run sync with force to regenerate all sessions
claudeinsight sync --force --dry-run
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify builds pass"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add types | `cli/src/types.ts` |
| 2 | Create title generation module | `cli/src/parser/titles.ts` |
| 3 | Integrate into parser | `cli/src/parser/jsonl.ts` |
| 4 | Add structured insight parsing | `cli/src/types.ts`, `cli/src/parser/insights.ts` |
| 5 | Update web types | `web/src/lib/types.ts` |
| 6 | Update SessionCard | `web/src/components/sessions/SessionCard.tsx` |
| 7 | Update InsightCard | `web/src/components/insights/InsightCard.tsx` |
| 8 | Update session detail page | `web/src/app/sessions/[id]/page.tsx` |
| 9 | Add CLI flag | `cli/src/commands/sync.ts`, `cli/src/index.ts` |
| 10 | Build and test | All |

**Total commits:** 10
**Estimated time:** 45-60 minutes
