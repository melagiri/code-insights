import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be declared before the module under test is imported.
vi.mock('child_process', () => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }));
vi.mock('fs', () => ({
  openSync: vi.fn(() => 3),
  closeSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));
vi.mock('url', () => ({ fileURLToPath: vi.fn(() => '/fake/path/session-end.js') }));
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, resolve: vi.fn(() => '/fake/index.js') };
});

const mockGetConfigDir = vi.fn(() => '/tmp/code-insights');
vi.mock('../../utils/config.js', () => ({ getConfigDir: mockGetConfigDir }));

const mockSyncSingleFile = vi.fn();
vi.mock('../sync.js', () => ({ syncSingleFile: mockSyncSingleFile }));

const mockEnqueue = vi.fn();
vi.mock('../../db/queue.js', () => ({ enqueue: mockEnqueue }));

const mockSessionExists = vi.fn();
vi.mock('../../db/read.js', () => ({ sessionExists: mockSessionExists }));

const { sessionEndCommand } = await import('../session-end.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStdin(payload: Record<string, unknown>): void {
  const data = JSON.stringify(payload);
  Object.defineProperty(process, 'stdin', {
    value: {
      isTTY: false,
      setEncoding: vi.fn(),
      on: vi.fn((event: string, cb: (chunk?: string) => void) => {
        if (event === 'data') cb(data);
        if (event === 'end') cb();
      }),
    },
    writable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionEndCommand — empty session guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CODE_INSIGHTS_HOOK_ACTIVE;
  });

  it('does NOT call enqueue when session is absent from the DB', async () => {
    mockSessionExists.mockReturnValue(false);
    makeStdin({ session_id: 'ghost-session', transcript_path: null });

    await sessionEndCommand({ quiet: true });

    expect(mockSessionExists).toHaveBeenCalledWith('ghost-session');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('calls enqueue when session exists in the DB', async () => {
    mockSessionExists.mockReturnValue(true);
    makeStdin({ session_id: 'real-session', transcript_path: null });

    await sessionEndCommand({ quiet: true, native: true });

    expect(mockSessionExists).toHaveBeenCalledWith('real-session');
    expect(mockEnqueue).toHaveBeenCalledWith('real-session', 'native');
  });

  it('returns early without calling sessionExists when session_id is missing', async () => {
    makeStdin({});

    await sessionEndCommand({ quiet: true });

    expect(mockSessionExists).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('returns early without calling sessionExists when CODE_INSIGHTS_HOOK_ACTIVE is set', async () => {
    process.env.CODE_INSIGHTS_HOOK_ACTIVE = '1';
    makeStdin({ session_id: 'any-session' });

    await sessionEndCommand({ quiet: true });

    expect(mockSessionExists).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
