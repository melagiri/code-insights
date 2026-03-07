import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeParsedMessage, makeParsedSession } from '../__fixtures__/db/seed.js';

let syncState = { lastSync: '', files: {} as Record<string, any> };
const saveSyncState = vi.fn((state: typeof syncState) => {
  syncState = state;
});

vi.mock('../utils/config.js', () => ({
  loadSyncState: () => syncState,
  saveSyncState,
  getConfigDir: () => os.tmpdir(),
  getClaudeDir: () => path.join(os.tmpdir(), 'claude'),
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({}),
}));

const insertSessionWithProjectAndReturnIsNew = vi.fn();
const insertMessages = vi.fn();
const recalculateUsageStats = vi.fn(() => ({ sessionsWithUsage: 0, totalTokens: 0, estimatedCostUsd: 0 }));
vi.mock('../db/write.js', () => ({
  insertSessionWithProjectAndReturnIsNew,
  insertMessages,
  recalculateUsageStats,
}));

const getAllProviders = vi.fn();
vi.mock('../providers/registry.js', () => ({
  getAllProviders,
  getProvider: vi.fn(),
}));

vi.mock('../providers/context.js', () => ({
  setProviderVerbose: () => {},
}));

vi.mock('../utils/telemetry.js', () => ({
  trackEvent: () => {},
}));

const { runSync } = await import('./sync.js');

describe('runSync', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-insights-sync-'));
    syncState = { lastSync: '', files: {} };
    saveSyncState.mockClear();
    insertSessionWithProjectAndReturnIsNew.mockReset();
    insertMessages.mockReset();
    recalculateUsageStats.mockClear();
    getAllProviders.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('updates existing sessions by default and recalculates usage stats', async () => {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, '{}');

    syncState.files[filePath] = {
      lastModified: new Date(0).toISOString(),
      lastSyncedLine: 0,
      sessionId: 'session-1',
    };

    const session = makeParsedSession({
      id: 'session-1',
      messageCount: 3,
      userMessageCount: 2,
      assistantMessageCount: 1,
      messages: [
        makeParsedMessage({ id: 'msg-1', sessionId: 'session-1' }),
        makeParsedMessage({ id: 'msg-2', sessionId: 'session-1', type: 'assistant' }),
        makeParsedMessage({ id: 'msg-3', sessionId: 'session-1' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'mock',
        discover: async () => [filePath],
        parse: async () => session,
      },
    ]);

    insertSessionWithProjectAndReturnIsNew.mockReturnValue(false);

    await runSync({ quiet: true });

    expect(insertSessionWithProjectAndReturnIsNew).toHaveBeenCalledTimes(1);
    expect(insertSessionWithProjectAndReturnIsNew).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      false,
    );
    expect(insertMessages).toHaveBeenCalledTimes(1);
    expect(recalculateUsageStats).toHaveBeenCalledTimes(1);
  });

  it('re-syncs virtual paths when the backing DB file changes', async () => {
    const dbPath = path.join(tempDir, 'state.vscdb');
    fs.writeFileSync(dbPath, 'db');
    const virtualPath = `${dbPath}#composer-1`;

    syncState.files[dbPath] = {
      lastModified: new Date(0).toISOString(),
      lastSyncedLine: 0,
      sessionId: 'cursor:composer-1',
      syncedSessionIds: ['composer-1'],
    };

    const session = makeParsedSession({
      id: 'cursor:composer-1',
      sourceTool: 'cursor',
      messageCount: 3,
      userMessageCount: 2,
      assistantMessageCount: 1,
      messages: [
        makeParsedMessage({ id: 'msg-2', sessionId: 'cursor:composer-1' }),
        makeParsedMessage({ id: 'msg-3', sessionId: 'cursor:composer-1', type: 'assistant' }),
        makeParsedMessage({ id: 'msg-4', sessionId: 'cursor:composer-1' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'cursor',
        discover: async () => [virtualPath],
        parse: async () => session,
      },
    ]);

    insertSessionWithProjectAndReturnIsNew.mockReturnValue(false);

    await runSync({ quiet: true });

    expect(insertSessionWithProjectAndReturnIsNew).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cursor:composer-1' }),
      false,
    );
    expect(recalculateUsageStats).toHaveBeenCalledTimes(1);
  });

  it('does not recalculate usage stats for purely new sessions', async () => {
    const filePath = path.join(tempDir, 'new-session.jsonl');
    fs.writeFileSync(filePath, '{}');

    const session = makeParsedSession({
      id: 'session-new',
      messageCount: 3,
      userMessageCount: 2,
      assistantMessageCount: 1,
      messages: [
        makeParsedMessage({ id: 'msg-new-1', sessionId: 'session-new' }),
        makeParsedMessage({ id: 'msg-new-2', sessionId: 'session-new', type: 'assistant' }),
        makeParsedMessage({ id: 'msg-new-3', sessionId: 'session-new' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'mock',
        discover: async () => [filePath],
        parse: async () => session,
      },
    ]);

    insertSessionWithProjectAndReturnIsNew.mockReturnValue(true);

    await runSync({ quiet: true });

    expect(insertSessionWithProjectAndReturnIsNew).toHaveBeenCalledTimes(1);
    expect(recalculateUsageStats).not.toHaveBeenCalled();
  });

  it('skips sessions with 2 or fewer messages', async () => {
    const filePath = path.join(tempDir, 'trivial.jsonl');
    fs.writeFileSync(filePath, '{}');

    const trivialSession = makeParsedSession({
      id: 'session-trivial',
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      messages: [
        makeParsedMessage({ id: 'msg-t1', sessionId: 'session-trivial' }),
        makeParsedMessage({ id: 'msg-t2', sessionId: 'session-trivial', type: 'assistant' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'mock',
        discover: async () => [filePath],
        parse: async () => trivialSession,
      },
    ]);

    const result = await runSync({ quiet: true });

    expect(insertSessionWithProjectAndReturnIsNew).not.toHaveBeenCalled();
    expect(insertMessages).not.toHaveBeenCalled();
    expect(result.syncedCount).toBe(0);
  });

  it('syncs sessions with 3 or more messages', async () => {
    const filePath = path.join(tempDir, 'valid.jsonl');
    fs.writeFileSync(filePath, '{}');

    const validSession = makeParsedSession({
      id: 'session-valid',
      messageCount: 3,
      userMessageCount: 2,
      assistantMessageCount: 1,
      messages: [
        makeParsedMessage({ id: 'msg-v1', sessionId: 'session-valid' }),
        makeParsedMessage({ id: 'msg-v2', sessionId: 'session-valid', type: 'assistant' }),
        makeParsedMessage({ id: 'msg-v3', sessionId: 'session-valid' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'mock',
        discover: async () => [filePath],
        parse: async () => validSession,
      },
    ]);

    insertSessionWithProjectAndReturnIsNew.mockReturnValue(true);

    const result = await runSync({ quiet: true });

    expect(insertSessionWithProjectAndReturnIsNew).toHaveBeenCalledTimes(1);
    expect(insertMessages).toHaveBeenCalledTimes(1);
    expect(result.syncedCount).toBe(1);
  });
});
