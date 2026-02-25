import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { isConfigured, resolveDataSourcePreference } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const HOOKS_FILE = path.join(CLAUDE_SETTINGS_DIR, 'settings.json');

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookConfig[];
    Stop?: HookConfig[];
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

/**
 * Install Claude Code hook for auto-sync
 */
export async function installHookCommand(): Promise<void> {
  console.log(chalk.cyan('\n🔗 Install Code Insights Hook\n'));

  // Check if configured
  if (!isConfigured()) {
    console.log(chalk.yellow('\n  The auto-sync hook requires Firebase to be configured.\n'));
    console.log(chalk.white('  To set up Firebase:'));
    console.log(chalk.gray('    code-insights init\n'));
    console.log(chalk.white('  For local-only analytics (no hook needed):'));
    console.log(chalk.gray('    code-insights stats\n'));
    return;
  }

  const preference = resolveDataSourcePreference();
  if (preference === 'local') {
    console.log(chalk.yellow('\n  ⚠ Data source is local. The auto-sync hook is only useful with Firebase.\n'));
    console.log(chalk.gray('  Stats refresh automatically when you run `code-insights stats`.'));
    console.log(chalk.gray('  To switch to Firebase: code-insights config set-source firebase\n'));
    return;
  }

  // Get CLI path
  const cliPath = process.argv[1];
  const syncCommand = `node ${cliPath} sync -q`;

  console.log(chalk.gray('This will add a Claude Code hook that syncs sessions automatically.'));
  console.log(chalk.gray(`Hook command: ${syncCommand}\n`));

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

  // Initialize hooks structure
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Add Stop hook (runs when Claude finishes responding)
  const stopHook: HookConfig = {
    hooks: [{ type: 'command', command: syncCommand }],
  };

  // Check if hook already exists
  const existingStopHooks = settings.hooks.Stop || [];
  const hookExists = existingStopHooks.some(
    (h) => h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
  );

  if (hookExists) {
    console.log(chalk.yellow('Code Insights hook already installed.'));
    console.log(chalk.gray('To reinstall, first run `code-insights uninstall-hook`'));
    return;
  }

  settings.hooks.Stop = [...existingStopHooks, stopHook];

  // Write settings
  fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(HOOKS_FILE, JSON.stringify(settings, null, 2));

  console.log(chalk.green('✅ Hook installed successfully!'));
  console.log(chalk.gray(`\nConfiguration saved to: ${HOOKS_FILE}`));
  console.log(chalk.cyan('\nHow it works:'));
  console.log(chalk.white('  • When a Claude Code session ends, the hook runs'));
  console.log(chalk.white('  • Sessions are automatically synced to your Firestore'));
  console.log(chalk.white('  • Check your dashboard for new insights'));
  trackEvent('install-hook', true);
}

/**
 * Uninstall Claude Code hook
 */
export async function uninstallHookCommand(): Promise<void> {
  console.log(chalk.cyan('\n🔗 Uninstall Code Insights Hook\n'));

  if (!fs.existsSync(HOOKS_FILE)) {
    console.log(chalk.yellow('No hooks file found. Nothing to uninstall.'));
    return;
  }

  try {
    const content = fs.readFileSync(HOOKS_FILE, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    if (!settings.hooks?.Stop) {
      console.log(chalk.yellow('No Stop hooks found. Nothing to uninstall.'));
      return;
    }

    // Filter out Code Insights hooks
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => !h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
    );

    // Clean up empty arrays
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    fs.writeFileSync(HOOKS_FILE, JSON.stringify(settings, null, 2));

    console.log(chalk.green('✅ Hook uninstalled successfully!'));
  } catch (error) {
    console.log(chalk.red('Failed to uninstall hook:'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}
