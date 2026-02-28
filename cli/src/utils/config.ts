import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClaudeInsightConfig, SyncState } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.code-insights');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SYNC_STATE_FILE = path.join(CONFIG_DIR, 'sync-state.json');

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration from file
 */
export function loadConfig(): ClaudeInsightConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as ClaudeInsightConfig;
  } catch {
    return null;
  }
}

/**
 * Save configuration to file.
 *
 * Only the known fields of ClaudeInsightConfig are written. This strips any
 * stale keys (e.g. `firebase`, `webConfig`, `dataSource`, `dashboardUrl`)
 * that may have been persisted by earlier versions of the CLI, so they don't
 * accumulate in the config file across upgrades.
 */
export function saveConfig(config: ClaudeInsightConfig): void {
  ensureConfigDir();
  const clean: ClaudeInsightConfig = {
    sync: config.sync,
  };
  if (config.dashboard !== undefined) {
    clean.dashboard = {
      ...(config.dashboard.port !== undefined ? { port: config.dashboard.port } : {}),
      ...(config.dashboard.llm !== undefined ? { llm: config.dashboard.llm } : {}),
    };
  }
  if (config.telemetry !== undefined) {
    clean.telemetry = config.telemetry;
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(clean, null, 2), { mode: 0o600 });
}

/**
 * Load sync state
 */
export function loadSyncState(): SyncState {
  try {
    if (!fs.existsSync(SYNC_STATE_FILE)) {
      return { lastSync: '', files: {} };
    }
    const content = fs.readFileSync(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(content) as SyncState;
  } catch {
    return { lastSync: '', files: {} };
  }
}

/**
 * Save sync state
 */
export function saveSyncState(state: SyncState): void {
  ensureConfigDir();
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Get default Claude directory
 */
export function getClaudeDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Check if config exists
 */
export function isConfigured(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the sync state file path (used by reset command)
 */
export function getSyncStatePath(): string {
  return SYNC_STATE_FILE;
}
