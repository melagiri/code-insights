import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { trackEvent, captureError, classifyError } from '../utils/telemetry.js';

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const HOOKS_FILE = path.join(CLAUDE_SETTINGS_DIR, 'settings.json');

// Stable path to the CLI entry point — works across npm link, global install, and npx.
// process.argv[1] is unstable (npx uses a cache path that changes per invocation).
const CLI_ENTRY = path.resolve(fileURLToPath(import.meta.url), '../../index.js');

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookConfig[];
    Stop?: HookConfig[];
    SessionEnd?: HookConfig[];
    [key: string]: HookConfig[] | undefined;
  };
  [key: string]: unknown;
}

interface HookConfig {
  matcher?: string;
  hooks: Array<string | { type: string; command: string; timeout?: number }>;
}

/** Extract command string from both old (string) and new ({type, command}) hook formats */
function getHookCommand(hook: string | { type: string; command: string }): string {
  return typeof hook === 'string' ? hook : hook.command;
}

/** Check if a hook array already contains a code-insights hook */
function hookAlreadyInstalled(hookList: HookConfig[]): boolean {
  return hookList.some(
    (h) => h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
  );
}

/**
 * Remove any existing Code Insights Stop hooks (v4.8.x migration).
 * v4.8.x installed a Stop hook for sync; v4.9+ uses a single SessionEnd hook.
 * Called on install so re-running install-hook cleans up the old setup.
 */
function removeStopHooks(settings: ClaudeSettings): boolean {
  if (!settings.hooks?.Stop) return false;
  const before = settings.hooks.Stop.length;
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (h) => !h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
  );
  if (settings.hooks.Stop.length === 0) {
    delete settings.hooks.Stop;
  }
  return settings.hooks.Stop === undefined
    ? before > 0
    : settings.hooks.Stop.length < before;
}

/**
 * Install the single Code Insights SessionEnd hook.
 *
 * v4.9+ uses one SessionEnd hook that does sync + enqueue + worker spawn.
 * Running install-hook again removes the old Stop hook (v4.8.x hygiene) and
 * installs a fresh session-end hook.
 */
export async function installHookCommand(): Promise<void> {
  console.log(chalk.cyan('\nInstall Code Insights Hook\n'));

  const sessionEndCommand = `node ${CLI_ENTRY} session-end --native -q`;

  console.log(chalk.gray('This will add one Claude Code SessionEnd hook:\n'));
  console.log(chalk.white('  SessionEnd hook — Syncs and analyzes sessions when they end'));
  console.log(chalk.gray('                    Uses your Claude subscription. No API key needed.\n'));

  try {
    // Load existing settings
    let settings: ClaudeSettings = {};
    if (fs.existsSync(HOOKS_FILE)) {
      try {
        const content = fs.readFileSync(HOOKS_FILE, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        console.log(chalk.yellow('Could not parse existing settings.json, creating new one.'));
      }
    }

    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Clean up v4.8.x Stop hook if present (sync hook from old two-hook system).
    const removedStop = removeStopHooks(settings);
    if (removedStop) {
      console.log(chalk.dim('  Removed legacy Stop hook from v4.8.x'));
    }

    // Install the new unified SessionEnd hook (skip if already installed)
    if (!settings.hooks.SessionEnd) {
      settings.hooks.SessionEnd = [];
    }

    if (!hookAlreadyInstalled(settings.hooks.SessionEnd)) {
      const newHook: HookConfig = {
        // timeout: 10s is enough — session-end exits immediately after spawn
        hooks: [{ type: 'command', command: sessionEndCommand, timeout: 10000 }],
      };
      settings.hooks.SessionEnd.push(newHook);
    }

    // Write settings
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify(settings, null, 2));

    console.log(chalk.green('Hook installed successfully!'));
    console.log(chalk.gray(`\nConfiguration saved to: ${HOOKS_FILE}`));
    console.log(chalk.cyan('\nHow it works:'));
    console.log(chalk.white('  When a session ends, Code Insights syncs it and queues it for analysis.'));
    console.log(chalk.white('  Analysis runs in the background — no delay when you end a session.'));
    console.log(chalk.dim('\n  Check queue status: code-insights queue status'));

    trackEvent('cli_install_hook', {
      success: true,
      hook_types: 'session-end',
      sync_installed: false,
      analysis_installed: true,
    });
  } catch (error) {
    console.log(chalk.red(`Failed to install hook: ${error instanceof Error ? error.message : 'Unknown error'}`));
    const { error_type, error_message } = classifyError(error);
    trackEvent('cli_install_hook', { success: false, error_type, error_message });
    captureError(error, { command: 'install_hook', error_type });
  }
}

/**
 * Uninstall Code Insights hooks.
 * Handles both v4.9+ (SessionEnd session-end) and v4.8.x (Stop sync + SessionEnd insights --hook).
 */
export async function uninstallHookCommand(): Promise<void> {
  console.log(chalk.cyan('\nUninstall Code Insights Hooks\n'));

  if (!fs.existsSync(HOOKS_FILE)) {
    console.log(chalk.yellow('No hooks file found. Nothing to uninstall.'));
    return;
  }

  try {
    const content = fs.readFileSync(HOOKS_FILE, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    if (!settings.hooks?.Stop && !settings.hooks?.SessionEnd) {
      console.log(chalk.yellow('No Code Insights hooks found. Nothing to uninstall.'));
      return;
    }

    // Remove all Code Insights hooks (Stop and SessionEnd, any command format)
    if (settings.hooks.Stop) {
      settings.hooks.Stop = settings.hooks.Stop.filter(
        (h) => !h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
      );
      if (settings.hooks.Stop.length === 0) {
        delete settings.hooks.Stop;
      }
    }

    if (settings.hooks.SessionEnd) {
      settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
        (h) => !h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
      );
      if (settings.hooks.SessionEnd.length === 0) {
        delete settings.hooks.SessionEnd;
      }
    }

    // Clean up empty hooks object
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    fs.writeFileSync(HOOKS_FILE, JSON.stringify(settings, null, 2));

    console.log(chalk.green('Hooks uninstalled successfully!'));
  } catch (error) {
    console.log(chalk.red('Failed to uninstall hooks:'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}
