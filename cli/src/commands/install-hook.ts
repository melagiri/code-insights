import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { trackEvent, captureError, classifyError } from '../utils/telemetry.js';

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const HOOKS_FILE = path.join(CLAUDE_SETTINGS_DIR, 'settings.json');

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

export interface InstallHookOptions {
  syncOnly?: boolean;
  analysisOnly?: boolean;
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
 * Install Claude Code hooks for auto-sync and native session analysis.
 *
 * By default installs both the Stop (sync) and SessionEnd (analysis) hooks.
 * Use --sync-only or --analysis-only for granular control.
 */
export async function installHookCommand(options: InstallHookOptions = {}): Promise<void> {
  const { syncOnly = false, analysisOnly = false } = options;

  if (syncOnly && analysisOnly) {
    console.log(chalk.red('Cannot use --sync-only and --analysis-only together. Use neither flag to install both hooks.'));
    return;
  }

  const installSync = !analysisOnly;
  const installAnalysis = !syncOnly;

  console.log(chalk.cyan('\nInstall Code Insights Hooks\n'));

  try {
    const cliPath = process.argv[1];
    const syncCommand = `node ${cliPath} sync -q`;
    const analysisCommand = `node ${cliPath} insights --hook --native -q`;

    if (!syncOnly && !analysisOnly) {
      console.log(chalk.gray('This will add two Claude Code hooks:\n'));
      console.log(chalk.white('  Stop hook         — Syncs sessions after each response'));
      console.log(chalk.white('  SessionEnd hook   — Analyzes sessions using your Claude subscription'));
      console.log(chalk.gray('                      No API key needed. (~15-30s per session)\n'));
    } else if (syncOnly) {
      console.log(chalk.gray(`This will add a Stop hook: ${syncCommand}\n`));
    } else {
      console.log(chalk.gray(`This will add a SessionEnd hook: ${analysisCommand}\n`));
    }

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

    let syncInstalled = false;
    let analysisInstalled = false;

    // Install Stop hook (sync)
    if (installSync) {
      const existingStopHooks = settings.hooks.Stop || [];
      if (hookAlreadyInstalled(existingStopHooks)) {
        console.log(chalk.yellow('Stop hook already installed.'));
      } else {
        const stopHook: HookConfig = {
          hooks: [{ type: 'command', command: syncCommand }],
        };
        settings.hooks.Stop = [...existingStopHooks, stopHook];
        syncInstalled = true;
      }
    }

    // Install SessionEnd hook (analysis)
    if (installAnalysis) {
      const existingSessionEndHooks = settings.hooks.SessionEnd || [];
      if (hookAlreadyInstalled(existingSessionEndHooks)) {
        console.log(chalk.yellow('SessionEnd hook already installed.'));
      } else {
        const sessionEndHook: HookConfig = {
          hooks: [{ type: 'command', command: analysisCommand, timeout: 120000 }],
        };
        settings.hooks.SessionEnd = [...existingSessionEndHooks, sessionEndHook];
        analysisInstalled = true;
      }
    }

    if (!syncInstalled && !analysisInstalled) {
      console.log(chalk.yellow('Code Insights hooks already installed.'));
      console.log(chalk.gray('To reinstall, first run `code-insights uninstall-hook`'));
      return;
    }

    // Write settings
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify(settings, null, 2));

    const installedTypes: string[] = [];
    if (syncInstalled) installedTypes.push('sync');
    if (analysisInstalled) installedTypes.push('analysis');

    console.log(chalk.green('Hook installed successfully!'));
    console.log(chalk.gray(`\nConfiguration saved to: ${HOOKS_FILE}`));

    if (!analysisOnly) {
      console.log(chalk.cyan('\nHow it works:'));
      console.log(chalk.white('  Stop hook: sessions are synced after each Claude response'));
    }
    if (!syncOnly) {
      console.log(chalk.white('  SessionEnd hook: sessions are analyzed when a session ends'));
      console.log(chalk.white('  No API key needed — uses your Claude Code subscription'));
    }

    trackEvent('cli_install_hook', {
      success: true,
      hook_types: installedTypes.join(','),
      sync_installed: syncInstalled,
      analysis_installed: analysisInstalled,
    });
  } catch (error) {
    console.log(chalk.red(`Failed to install hook: ${error instanceof Error ? error.message : 'Unknown error'}`));
    const { error_type, error_message } = classifyError(error);
    trackEvent('cli_install_hook', { success: false, error_type, error_message });
    captureError(error, { command: 'install_hook', error_type });
  }
}

/**
 * Uninstall Claude Code hooks — removes both Stop (sync) and SessionEnd (analysis) hooks.
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

    // Filter out Code Insights Stop hooks
    if (settings.hooks.Stop) {
      settings.hooks.Stop = settings.hooks.Stop.filter(
        (h) => !h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
      );
      if (settings.hooks.Stop.length === 0) {
        delete settings.hooks.Stop;
      }
    }

    // Filter out Code Insights SessionEnd hooks
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
