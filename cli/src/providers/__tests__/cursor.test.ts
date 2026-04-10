import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { CursorProvider } from '../cursor.js';

// ---------------------------------------------------------------------------
// Helpers — build a minimal Cursor-style SQLite database in a temp dir.
//
// CursorProvider.parse() accepts a virtual path: `<dbPath>#<composerId>`.
// We create a real SQLite file with the `cursorDiskKV` table that Cursor uses
// and store JSON composer data blobs exactly as Cursor would.
// ---------------------------------------------------------------------------

const COMPOSER_ID = 'test-composer-abc123';

function makeCursorDb(dir: string, composerData: Record<string, unknown>): string {
  const dbPath = path.join(dir, 'state.vscdb');
  const db = new Database(dbPath);
  db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);');
  db.prepare('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)').run(
    `composerData:${COMPOSER_ID}`,
    JSON.stringify(composerData),
  );
  db.close();
  return dbPath;
}

function virtualPath(dbPath: string): string {
  return `${dbPath}#${COMPOSER_ID}`;
}

function userBubble(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { bubbleId: 'bubble-user-1', type: 1, text: 'How do I fix the login bug?', ...overrides };
}

function assistantBubble(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { bubbleId: 'bubble-assistant-1', type: 2, text: 'Here is how to fix the login bug.', ...overrides };
}

describe('CursorProvider — parsing accuracy fixes', () => {
  let tempDir: string;
  const provider = new CursorProvider();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Timestamps ────────────────────────────────────────────────────────────

  it('uses timingInfo.clientRpcSendTime as the timestamp for assistant bubbles', async () => {
    const rpcTime = 1748076005959;
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble(),
        assistantBubble({ timingInfo: { clientRpcSendTime: rpcTime, clientStartTime: 926228.7 } }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    const assistantMsg = session!.messages.find(m => m.type === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.timestamp.getTime()).toBe(rpcTime);
  });

  it('falls back to epoch when timingInfo is absent on an assistant bubble', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [userBubble(), assistantBubble()],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    const assistantMsg = session!.messages.find(m => m.type === 'assistant');
    expect(assistantMsg!.timestamp.getTime()).toBe(0);
  });

  it('ignores clientStartTime (performance offset < 1e12) and falls back to epoch', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble(),
        assistantBubble({ timingInfo: { clientStartTime: 926228.7 } }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    const assistantMsg = session!.messages.find(m => m.type === 'assistant');
    expect(assistantMsg!.timestamp.getTime()).toBe(0);
  });

  it('falls back to epoch for user bubbles (no timestamp available)', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble(),
        assistantBubble({ timingInfo: { clientRpcSendTime: 1748076005959 } }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    const userMsg = session!.messages.find(m => m.type === 'user');
    expect(userMsg!.timestamp.getTime()).toBe(0);
  });

  // ── Cost (usageData) ───────────────────────────────────────────────────────

  it('converts usageData.default.costInCents to estimatedCostUsd', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [userBubble(), assistantBubble()],
      usageData: { default: { costInCents: 44 } },
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    expect(session!.usage!.estimatedCostUsd).toBeCloseTo(0.44);
  });

  it('leaves usage undefined when usageData is absent and no token counts', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [userBubble(), assistantBubble()],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.usage).toBeUndefined();
  });

  it('leaves usage undefined when usageData.default is absent', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [userBubble(), assistantBubble()],
      usageData: {},
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.usage).toBeUndefined();
  });

  // ── Token counts ──────────────────────────────────────────────────────────

  it('aggregates tokenCount from multiple assistant bubbles', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ bubbleId: 'u1', text: 'First question' }),
        assistantBubble({ bubbleId: 'a1', text: 'First answer', tokenCount: { inputTokens: 100, outputTokens: 50 } }),
        userBubble({ bubbleId: 'u2', text: 'Second question' }),
        assistantBubble({ bubbleId: 'a2', text: 'Second answer', tokenCount: { inputTokens: 200, outputTokens: 75 } }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    expect(session!.usage!.totalInputTokens).toBe(300);
    expect(session!.usage!.totalOutputTokens).toBe(125);
  });

  it('skips tokenCount on user bubbles (always 0/0)', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ tokenCount: { inputTokens: 0, outputTokens: 0 } }),
        assistantBubble({ tokenCount: { inputTokens: 150, outputTokens: 60 } }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.usage!.totalInputTokens).toBe(150);
    expect(session!.usage!.totalOutputTokens).toBe(60);
  });

  // ── gitBranch ─────────────────────────────────────────────────────────────

  it('extracts gitBranch from gitStatusRaw on the first user bubble', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ gitStatusRaw: "On branch main\nYour branch is up to date.\n\nnothing to commit" }),
        assistantBubble(),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.gitBranch).toBe('main');
  });

  it('returns null gitBranch when gitStatusRaw shows detached HEAD', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ gitStatusRaw: 'HEAD detached at abc1234\nnothing to commit' }),
        assistantBubble(),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.gitBranch).toBeNull();
  });

  it('returns null gitBranch when git reports "(no branch)"', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ gitStatusRaw: 'On branch (no branch)\nInteractive rebase in progress' }),
        assistantBubble(),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.gitBranch).toBeNull();
  });

  it('returns null gitBranch when no gitStatusRaw is present', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [userBubble(), assistantBubble()],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.gitBranch).toBeNull();
  });

  // ── messageCount consistency ──────────────────────────────────────────────

  it('messageCount equals userMessageCount + assistantMessageCount', async () => {
    const dbPath = makeCursorDb(tempDir, {
      conversation: [
        userBubble({ bubbleId: 'u1' }),
        assistantBubble({ bubbleId: 'a1' }),
        userBubble({ bubbleId: 'u2', text: 'follow-up question' }),
        assistantBubble({ bubbleId: 'a2', text: 'follow-up answer' }),
      ],
    });
    const session = await provider.parse(virtualPath(dbPath));
    expect(session).not.toBeNull();
    expect(session!.messageCount).toBe(session!.userMessageCount + session!.assistantMessageCount);
    expect(session!.userMessageCount).toBe(2);
    expect(session!.assistantMessageCount).toBe(2);
    expect(session!.messageCount).toBe(4);
  });
});
