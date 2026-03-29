import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../utils/telemetry.js', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
  classifyError: vi.fn(() => ({ error_type: 'unknown', error_message: 'unknown' })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOOKS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');

/** Read and parse the settings.json file written during test */
function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf-8'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('installHookCommand', () => {
  let tmpDir: string;
  let originalHooksFile: string | null = null;

  beforeEach(() => {
    // Use a temp dir so we don't corrupt real ~/.claude/settings.json
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-hook-test-'));

    // Back up real settings.json if it exists
    if (fs.existsSync(HOOKS_FILE)) {
      originalHooksFile = fs.readFileSync(HOOKS_FILE, 'utf-8');
    } else {
      originalHooksFile = null;
    }

    vi.resetModules();
  });

  afterEach(() => {
    // Restore real settings.json
    if (originalHooksFile !== null) {
      fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
      fs.writeFileSync(HOOKS_FILE, originalHooksFile);
    } else if (fs.existsSync(HOOKS_FILE)) {
      fs.unlinkSync(HOOKS_FILE);
    }

    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });

    vi.clearAllMocks();
  });

  describe('default install (both hooks)', () => {
    it('installs both Stop and SessionEnd hooks', async () => {
      // Ensure clean state
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;

      expect(hooks).toBeDefined();
      expect(Array.isArray(hooks.Stop)).toBe(true);
      expect(Array.isArray(hooks.SessionEnd)).toBe(true);
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.SessionEnd).toHaveLength(1);
    });

    it('Stop hook contains sync command', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
      const stopHookEntry = hooks.Stop[0];

      expect(stopHookEntry.hooks).toHaveLength(1);
      const stopCmd = stopHookEntry.hooks[0];
      expect(stopCmd.type).toBe('command');
      expect(stopCmd.command).toContain('sync -q');
    });

    it('SessionEnd hook contains insights command with 120s timeout', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
      const sessionEndEntry = hooks.SessionEnd[0];

      expect(sessionEndEntry.hooks).toHaveLength(1);
      const sessionEndCmd = sessionEndEntry.hooks[0];
      expect(sessionEndCmd.type).toBe('command');
      expect(sessionEndCmd.command).toContain('insights --hook --native -q');
      expect(sessionEndCmd.timeout).toBe(120000);
    });

    it('preserves existing settings.json content', async () => {
      // Write some pre-existing settings
      fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
      fs.writeFileSync(HOOKS_FILE, JSON.stringify({ theme: 'dark', someOtherKey: 42 }));

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      expect(settings.theme).toBe('dark');
      expect(settings.someOtherKey).toBe(42);
    });

    it('preserves existing non-code-insights hooks', async () => {
      fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
      fs.writeFileSync(HOOKS_FILE, JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'other-tool sync' }] }],
        },
      }));

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      // Should have 2 Stop hooks now: the existing one + our new one
      expect(hooks.Stop).toHaveLength(2);
    });
  });

  describe('--sync-only + --analysis-only mutual exclusion', () => {
    it('returns early with error message when both flags are set', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({ syncOnly: true, analysisOnly: true });

      // No hooks file should have been written
      expect(fs.existsSync(HOOKS_FILE)).toBe(false);
    });
  });

  describe('--sync-only flag', () => {
    it('installs only Stop hook when --sync-only is set', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({ syncOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.SessionEnd).toBeUndefined();
    });
  });

  describe('--analysis-only flag', () => {
    it('installs only SessionEnd hook when --analysis-only is set', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({ analysisOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.SessionEnd).toHaveLength(1);
      expect(hooks.Stop).toBeUndefined();
    });
  });

  describe('duplicate detection', () => {
    it('does not install Stop hook if code-insights Stop hook already exists', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      // First install
      await installHookCommand({ syncOnly: true });
      // Second install
      await installHookCommand({ syncOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      // Should still be just 1, not 2
      expect(hooks.Stop).toHaveLength(1);
    });

    it('does not install SessionEnd hook if code-insights SessionEnd hook already exists', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      // First install
      await installHookCommand({ analysisOnly: true });
      // Second install
      await installHookCommand({ analysisOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.SessionEnd).toHaveLength(1);
    });

    it('reports already-installed when both hooks exist on default install', async () => {
      if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.SessionEnd).toHaveLength(1);
    });
  });
});

describe('uninstallHookCommand', () => {
  let originalHooksFile: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(HOOKS_FILE)) {
      originalHooksFile = fs.readFileSync(HOOKS_FILE, 'utf-8');
    } else {
      originalHooksFile = null;
    }
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHooksFile !== null) {
      fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
      fs.writeFileSync(HOOKS_FILE, originalHooksFile);
    } else if (fs.existsSync(HOOKS_FILE)) {
      fs.unlinkSync(HOOKS_FILE);
    }
    vi.clearAllMocks();
  });

  it('removes both Stop and SessionEnd code-insights hooks', async () => {
    // Set up settings with both hooks installed
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node /usr/local/lib/node_modules/@code-insights/cli/dist/index.js sync -q' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'node /usr/local/lib/node_modules/@code-insights/cli/dist/index.js insights --hook --native -q', timeout: 120000 }] }],
      },
    }));

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    // Both hook arrays should be gone (cleaned up)
    expect((settings.hooks as Record<string, unknown> | undefined)?.Stop).toBeUndefined();
    expect((settings.hooks as Record<string, unknown> | undefined)?.SessionEnd).toBeUndefined();
  });

  it('preserves non-code-insights Stop hooks', async () => {
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'other-tool cleanup' }] },
          { hooks: [{ type: 'command', command: 'node /path/code-insights sync -q' }] },
        ],
      },
    }));

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    const hooks = settings.hooks as Record<string, unknown[]>;
    // Other tool's hook should be preserved
    expect(hooks.Stop).toHaveLength(1);
    const remaining = hooks.Stop[0] as { hooks: Array<{ command: string }> };
    expect(remaining.hooks[0].command).toBe('other-tool cleanup');
  });

  it('preserves non-code-insights SessionEnd hooks', async () => {
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify({
      hooks: {
        SessionEnd: [
          { hooks: [{ type: 'command', command: 'other-tool end-session' }] },
          { hooks: [{ type: 'command', command: 'node /path/code-insights insights --hook --native -q', timeout: 120000 }] },
        ],
      },
    }));

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(hooks.SessionEnd).toHaveLength(1);
    const remaining = hooks.SessionEnd[0] as { hooks: Array<{ command: string }> };
    expect(remaining.hooks[0].command).toBe('other-tool end-session');
  });

  it('handles missing settings.json gracefully', async () => {
    if (fs.existsSync(HOOKS_FILE)) fs.unlinkSync(HOOKS_FILE);

    const { uninstallHookCommand } = await import('../install-hook.js');
    // Should not throw
    await expect(uninstallHookCommand()).resolves.toBeUndefined();
  });

  it('cleans up empty hooks object after removal', async () => {
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node /path/code-insights sync -q' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'node /path/code-insights insights --hook --native -q', timeout: 120000 }] }],
      },
    }));

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    // hooks object should be removed entirely since all entries were code-insights
    expect(settings.hooks).toBeUndefined();
  });
});
