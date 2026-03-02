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

const sessionExists = vi.fn();
vi.mock('../db/read.js', () => ({
  sessionExists,
}));

const insertSessionWithProject = vi.fn();
const insertMessages = vi.fn();
const recalculateUsageStats = vi.fn(() => ({ sessionsWithUsage: 0, totalTokens: 0, estimatedCostUsd: 0 }));
vi.mock('../db/write.js', () => ({
  insertSessionWithProject,
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
    sessionExists.mockReset();
    insertSessionWithProject.mockReset();
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
      messageCount: 1,
      userMessageCount: 1,
      assistantMessageCount: 0,
      messages: [
        makeParsedMessage({ id: 'msg-1', sessionId: 'session-1' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'mock',
        discover: async () => [filePath],
        parse: async () => session,
      },
    ]);

    sessionExists.mockReturnValue(true);

    await runSync({ quiet: true });

    expect(insertSessionWithProject).toHaveBeenCalledTimes(1);
    expect(insertSessionWithProject).toHaveBeenCalledWith(
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
      messageCount: 1,
      userMessageCount: 1,
      assistantMessageCount: 0,
      messages: [
        makeParsedMessage({ id: 'msg-2', sessionId: 'cursor:composer-1' }),
      ],
    });

    getAllProviders.mockReturnValue([
      {
        getProviderName: () => 'cursor',
        discover: async () => [virtualPath],
        parse: async () => session,
      },
    ]);

    sessionExists.mockReturnValue(true);

    await runSync({ quiet: true });

    expect(insertSessionWithProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cursor:composer-1' }),
      false,
    );
    expect(recalculateUsageStats).toHaveBeenCalledTimes(1);
  });
});
