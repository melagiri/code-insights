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

// Mock os module so homedir() returns our temp dir.
// Uses a mutable object (not a `let`) because vi.mock factories are hoisted before
// variable declarations — a plain object property is safe to read at any point.
const _mockOs = { homeDir: '' };

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => _mockOs.homeDir,
  };
});

// ── Setup: isolated temp home dir per test ────────────────────────────────────

let mockHomeDir: string;

beforeEach(() => {
  // Each test gets its own temp dir as home — never touches real ~/.claude/settings.json
  mockHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-hook-test-'));
  _mockOs.homeDir = mockHomeDir;
  // Reset module cache so CLAUDE_SETTINGS_DIR / HOOKS_FILE pick up the new mockHomeDir
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(mockHomeDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function hooksFile(): string {
  return path.join(mockHomeDir, '.claude', 'settings.json');
}

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(hooksFile(), 'utf-8'));
}

function writeSettings(data: unknown): void {
  const dir = path.join(mockHomeDir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(hooksFile(), JSON.stringify(data));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('installHookCommand', () => {
  describe('default install (both hooks)', () => {
    it('installs both Stop and SessionEnd hooks', async () => {
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

    it('Stop hook contains sync command pointing to stable CLI entry', async () => {
      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
      const stopCmd = hooks.Stop[0].hooks[0];

      expect(stopCmd.type).toBe('command');
      expect(stopCmd.command).toContain('sync -q');
      // Must use node + absolute path (not process.argv[1] which is unstable under npx)
      expect(stopCmd.command).toMatch(/^node .+index\.js sync -q$/);
    });

    it('SessionEnd hook contains insights command with 300s timeout', async () => {
      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
      const sessionEndCmd = hooks.SessionEnd[0].hooks[0];

      expect(sessionEndCmd.type).toBe('command');
      expect(sessionEndCmd.command).toContain('insights --hook --native -q');
      expect(sessionEndCmd.command).toMatch(/^node .+index\.js insights --hook --native -q$/);
      expect(sessionEndCmd.timeout).toBe(300000);
    });

    it('preserves existing settings.json content', async () => {
      writeSettings({ theme: 'dark', someOtherKey: 42 });

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      expect(settings.theme).toBe('dark');
      expect(settings.someOtherKey).toBe(42);
    });

    it('preserves existing non-code-insights hooks', async () => {
      writeSettings({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'other-tool sync' }] }],
        },
      });

      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      // Should have 2 Stop hooks: the existing one + our new one
      expect(hooks.Stop).toHaveLength(2);
    });
  });

  describe('--sync-only + --analysis-only mutual exclusion', () => {
    it('returns early with error message when both flags are set', async () => {
      const { installHookCommand } = await import('../install-hook.js');
      const consoleSpy = vi.spyOn(console, 'log');
      await installHookCommand({ syncOnly: true, analysisOnly: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot use'));
      // No settings file should have been written
      expect(fs.existsSync(hooksFile())).toBe(false);
    });
  });

  describe('--sync-only flag', () => {
    it('installs only Stop hook when --sync-only is set', async () => {
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
      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({ syncOnly: true });
      await installHookCommand({ syncOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
    });

    it('does not install SessionEnd hook if code-insights SessionEnd hook already exists', async () => {
      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({ analysisOnly: true });
      await installHookCommand({ analysisOnly: true });

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.SessionEnd).toHaveLength(1);
    });

    it('shows consolidated already-installed message when both hooks exist on default install', async () => {
      const { installHookCommand } = await import('../install-hook.js');
      await installHookCommand({});

      const consoleSpy = vi.spyOn(console, 'log');
      await installHookCommand({});

      // Single consolidated message, not two separate ones
      const alreadyInstalledCalls = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && String(args[0]).includes('already installed')
      );
      expect(alreadyInstalledCalls).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sync + analysis'));

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.SessionEnd).toHaveLength(1);
    });
  });
});

describe('uninstallHookCommand', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('removes both Stop and SessionEnd code-insights hooks', async () => {
    writeSettings({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node /usr/local/lib/node_modules/@code-insights/cli/dist/index.js sync -q' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'node /usr/local/lib/node_modules/@code-insights/cli/dist/index.js insights --hook --native -q', timeout: 300000 }] }],
      },
    });

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    expect((settings.hooks as Record<string, unknown> | undefined)?.Stop).toBeUndefined();
    expect((settings.hooks as Record<string, unknown> | undefined)?.SessionEnd).toBeUndefined();
  });

  it('preserves non-code-insights Stop hooks', async () => {
    writeSettings({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'other-tool cleanup' }] },
          { hooks: [{ type: 'command', command: 'node /path/code-insights sync -q' }] },
        ],
      },
    });

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(hooks.Stop).toHaveLength(1);
    const remaining = hooks.Stop[0] as { hooks: Array<{ command: string }> };
    expect(remaining.hooks[0].command).toBe('other-tool cleanup');
  });

  it('preserves non-code-insights SessionEnd hooks', async () => {
    writeSettings({
      hooks: {
        SessionEnd: [
          { hooks: [{ type: 'command', command: 'other-tool end-session' }] },
          { hooks: [{ type: 'command', command: 'node /path/code-insights insights --hook --native -q', timeout: 300000 }] },
        ],
      },
    });

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(hooks.SessionEnd).toHaveLength(1);
    const remaining = hooks.SessionEnd[0] as { hooks: Array<{ command: string }> };
    expect(remaining.hooks[0].command).toBe('other-tool end-session');
  });

  it('handles missing settings.json gracefully', async () => {
    const { uninstallHookCommand } = await import('../install-hook.js');
    await expect(uninstallHookCommand()).resolves.toBeUndefined();
  });

  it('cleans up empty hooks object after removal', async () => {
    writeSettings({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node /path/code-insights sync -q' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'node /path/code-insights insights --hook --native -q', timeout: 300000 }] }],
      },
    });

    const { uninstallHookCommand } = await import('../install-hook.js');
    await uninstallHookCommand();

    const settings = readSettings();
    expect(settings.hooks).toBeUndefined();
  });
});
