import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClaudeInsightConfig, SyncState, FirebaseWebConfig } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.code-insights');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SYNC_STATE_FILE = path.join(CONFIG_DIR, 'sync-state.json');
const WEB_CONFIG_FILE = path.join(CONFIG_DIR, 'web-config.json');

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
 * Save configuration to file
 */
export function saveConfig(config: ClaudeInsightConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
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
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
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
 * Load web config from file
 */
export function loadWebConfig(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(WEB_CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(WEB_CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save web config to file
 */
export function saveWebConfig(config: FirebaseWebConfig): void {
  ensureConfigDir();
  fs.writeFileSync(WEB_CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Check if web config exists
 */
export function hasWebConfig(): boolean {
  return fs.existsSync(WEB_CONFIG_FILE);
}
