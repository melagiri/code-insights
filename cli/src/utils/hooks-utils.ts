import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

export const HOOKS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
export const CURSOR_HOOKS_FILE = path.join(os.homedir(), '.cursor', 'hooks.json');

// Stable path to the CLI entry point — works across npm link, global install, and npx.
// Resolved relative to this file's location in utils/ (one level up to src/, then index.js).
export const CLI_ENTRY = path.resolve(fileURLToPath(import.meta.url), '../../index.js');

export interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookConfig[];
    Stop?: HookConfig[];
    SessionEnd?: HookConfig[];
    [key: string]: HookConfig[] | undefined;
  };
  [key: string]: unknown;
}

export interface HookConfig {
  matcher?: string;
  hooks: Array<string | { type: string; command: string; timeout?: number }>;
}

export interface CursorHookCommand {
  command: string;
}

export interface CursorHooksSettings {
  version?: number;
  hooks?: {
    stop?: CursorHookCommand[];
    [key: string]: CursorHookCommand[] | undefined;
  };
  [key: string]: unknown;
}

/** Extract command string from both old (string) and new ({type, command}) hook formats */
export function getHookCommand(hook: string | { type: string; command: string }): string {
  return typeof hook === 'string' ? hook : hook.command;
}

/** Check if a hook array already contains a code-insights hook */
export function hookAlreadyInstalled(hookList: HookConfig[]): boolean {
  return hookList.some(
    (h) => h.hooks.some((hook) => getHookCommand(hook).includes('code-insights'))
  );
}

export function cursorHookAlreadyInstalled(hookList: CursorHookCommand[]): boolean {
  return hookList.some(hook => hook.command.includes('code-insights'));
}

/** Read and parse ~/.claude/settings.json. Returns null if missing or unparseable. */
export function loadClaudeSettings(): ClaudeSettings | null {
  try {
    if (!fs.existsSync(HOOKS_FILE)) return null;
    const content = fs.readFileSync(HOOKS_FILE, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return null;
  }
}
