import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createRequire } from 'module';
import { loadConfig, getConfigDir, getClaudeDir } from './config.js';

const TELEMETRY_ENDPOINT = 'https://xrbkoqjfolxiyfxubiom.supabase.co/functions/v1/cli-telemetry-v2';

// HMAC signing key for request integrity.
// This is a deterrent, NOT a security boundary — npm packages are public and this key
// is extractable. The real security is enforced server-side in the Edge Function.
// Rotation: bump the endpoint version (cli-telemetry-v3) to rotate the key.
// The Edge Function accepts keys as a Supabase secret (HMAC_KEYS env var), not hardcoded.
const HMAC_KEY = 'fb73eabc121b8fe0bde2eb6f8a2d09c21bf74708d2148d7a520bb00661f03b7f';

// Touch file path that tracks whether the one-time disclosure has been shown
const NOTICE_FILE = path.join(getConfigDir(), '.telemetry-notice-shown');

export interface TelemetryEvent {
  machineId: string;          // SHA-256(hostname:username:monthly-salt)[0:16] — rotates monthly
  command: string;
  subcommand?: string;
  success: boolean;
  cliVersion: string;
  nodeVersion: string;
  os: string;                 // process.platform
  arch: string;               // process.arch
  providers: string[];        // detected from filesystem (which AI tool dirs exist)
  sessionCountBucket: string; // '0' | '1-10' | '11-50' | '51-200' | '200+'
  dataSource: string;         // 'local' | 'none'
  hasHook: boolean;
  timestamp: string;          // YYYY-MM-DD only (day precision — no time, no timezone)
}

/**
 * Check if telemetry is enabled.
 *
 * Check order (first match wins):
 * 1. CODE_INSIGHTS_TELEMETRY_DISABLED=1 env var — respects CI/automation opt-out
 * 2. DO_NOT_TRACK=1 env var — respects the community standard
 * 3. config.telemetry field — user's explicit preference
 * 4. Default: true (opt-out model)
 */
export function isTelemetryEnabled(): boolean {
  if (process.env.CODE_INSIGHTS_TELEMETRY_DISABLED === '1') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;

  const config = loadConfig();
  // If explicitly set in config, respect it
  if (config !== null && typeof config.telemetry === 'boolean') {
    return config.telemetry;
  }

  // Default: enabled (opt-out model)
  return true;
}

/**
 * Show the one-time telemetry disclosure notice if it hasn't been shown yet.
 *
 * Uses a touch file at ~/.code-insights/.telemetry-notice-shown to track state.
 * Only displays if telemetry is currently enabled — no point disclosing disabled telemetry.
 *
 * Returns true if the notice was shown, false if it was already shown or telemetry is off.
 */
export function showTelemetryNoticeIfNeeded(): boolean {
  if (!isTelemetryEnabled()) return false;
  if (fs.existsSync(NOTICE_FILE)) return false;

  // Show the disclosure banner
  console.log('');
  console.log('  Code Insights collects anonymous usage data to improve the CLI.');
  console.log('  Includes: command name, OS, CLI version, AI tool types.');
  console.log('  Never includes: file paths, project names, session content, or personal data.');
  console.log('');
  console.log('  Disable: code-insights telemetry disable');
  console.log('  Details: code-insights telemetry status');
  console.log('');

  // Mark notice as shown — best-effort write, ignore failures
  try {
    // Ensure config dir exists before writing touch file
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(NOTICE_FILE, '', { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Non-fatal — if we can't write the touch file, we'll show the notice again
    // next time. That's acceptable; we don't want to break the CLI over this.
  }

  return true;
}

/**
 * Fire-and-forget telemetry event. Does NOT block the calling command.
 *
 * Design principles:
 * - Never awaited: the caller doesn't wait for this
 * - 2s AbortController timeout: we don't hang if the endpoint is slow
 * - Swallows ALL errors: network failures, JSON errors, anything — telemetry
 *   must never cause a CLI command to fail
 * - No retries: if it fails, it fails. Reliability of individual events
 *   matters less than not disrupting the user's workflow.
 */
export function trackEvent(command: string, success: boolean, subcommand?: string): void {
  if (!isTelemetryEnabled()) return;

  // Build the event synchronously — filesystem reads happen here
  let event: TelemetryEvent;
  try {
    event = buildEvent(command, success, subcommand);
  } catch {
    // If building the event fails (e.g., filesystem read error), silently skip
    return;
  }

  // Fire-and-forget: intentionally not awaited
  // The void cast suppresses the "floating promise" lint warning
  void sendEvent(event);
}

/**
 * Build the event payload that would be sent for the given command.
 * Exported for use by `telemetry status` to show a preview without sending.
 */
export function buildEventPreview(command: string): TelemetryEvent {
  return buildEvent(command, true);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a TelemetryEvent with all fields populated.
 * Separated from sendEvent so buildEventPreview can reuse it without sending.
 */
function buildEvent(command: string, success: boolean, subcommand?: string): TelemetryEvent {
  return {
    machineId: getMachineId(),
    command,
    subcommand,
    success,
    cliVersion: getCliVersion(),
    nodeVersion: process.version.replace('v', ''),
    os: process.platform,
    arch: process.arch,
    providers: detectProviders(),
    sessionCountBucket: getSessionCountBucket(),
    dataSource: getDataSource(),
    hasHook: detectHook(),
    // Day precision only — avoids time-of-day behavioral fingerprinting
    timestamp: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Anonymous machine ID, rotated monthly.
 *
 * Format: SHA-256(hostname:username:code-insights-YYYY-MM).slice(0, 16)
 *
 * Monthly rotation ensures:
 * - Long-term tracking is not possible across months
 * - Events within a month can be correlated for "unique users" metrics
 * - No PII: hostname and username are never sent, only their hash
 */
function getMachineId(): string {
  const now = new Date();
  // YYYY-MM format for monthly rotation
  const monthSalt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let username: string;
  try {
    username = os.userInfo().username;
  } catch {
    // os.userInfo() throws in Docker/CI when UID has no /etc/passwd entry
    username = `uid-${process.getuid?.() ?? 'unknown'}`;
  }

  const input = [os.hostname(), username, `code-insights-${monthSalt}`].join(':');

  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Read CLI version from package.json.
 * Uses createRequire for JSON imports since this is ESM and JSON imports
 * have inconsistent support across Node versions and bundlers.
 */
function getCliVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    // package.json is two levels up from src/utils/ -> src/ -> cli/
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/**
 * Detect which AI coding tool data directories exist on this machine.
 * We check for the existence of known directories — we never read their contents.
 *
 * Returns only the tools that are actually present. This tells us which tools
 * users are running alongside code-insights, helping us prioritize provider support.
 */
function detectProviders(): string[] {
  const home = os.homedir();
  const detected: string[] = [];

  // Claude Code: ~/.claude/projects/
  if (fs.existsSync(path.join(home, '.claude', 'projects'))) {
    detected.push('claude-code');
  }

  // Cursor: workspace storage directory (cross-platform path)
  const cursorStoragePaths = [
    // macOS
    path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage'),
    // Linux
    path.join(home, '.config', 'Cursor', 'User', 'workspaceStorage'),
    // Windows
    path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'),
  ];
  if (cursorStoragePaths.some((p) => fs.existsSync(p))) {
    detected.push('cursor');
  }

  // Codex CLI: ~/.codex/sessions
  if (fs.existsSync(path.join(home, '.codex', 'sessions'))) {
    detected.push('codex-cli');
  }

  // GitHub Copilot CLI: ~/.copilot/session-state
  if (fs.existsSync(path.join(home, '.copilot', 'session-state'))) {
    detected.push('copilot-cli');
  }

  return detected;
}

/**
 * Count .jsonl files under ~/.claude/projects/ and bucket the count.
 *
 * Buckets are intentionally coarse — we want to understand "heavy vs light"
 * usage without counting exact files, which could vary wildly and feels more
 * private than a range.
 */
function getSessionCountBucket(): string {
  try {
    const claudeDir = getClaudeDir();
    if (!fs.existsSync(claudeDir)) return '0';

    // Count all .jsonl files recursively under the Claude projects directory
    let count = 0;
    const walk = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.jsonl')) {
          count++;
        }
      }
    };
    walk(claudeDir);

    // Coarse buckets for privacy — exact session counts are never sent
    if (count === 0) return '0';
    if (count <= 10) return '1-10';
    if (count <= 50) return '11-50';
    if (count <= 200) return '51-200';
    return '200+';
  } catch {
    return 'unknown';
  }
}

/**
 * Determine the configured data source.
 * Always 'local' in Phase 2+ (SQLite-only).
 */
function getDataSource(): string {
  const config = loadConfig();
  if (!config) return 'none';
  return 'local';
}

/**
 * Check if code-insights is registered as a Claude Code hook.
 *
 * Reads ~/.claude/settings.json and looks for 'code-insights' anywhere in the
 * file content. A hook registration means the user has automated sync on session end.
 */
function detectHook(): boolean {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) return false;

    const content = fs.readFileSync(settingsPath, 'utf-8');
    return content.includes('code-insights');
  } catch {
    return false;
  }
}

/**
 * Sign the request body with HMAC-SHA256.
 * Returns the hex digest prefixed with 'sha256=' for the X-Signature header.
 *
 * Note: the key is public (extractable from the npm package) — this is a deterrent
 * against casual data poisoning, not a cryptographic secret. Security is enforced
 * server-side in the Edge Function using constant-time comparison.
 */
function signPayload(body: string): string {
  const digest = crypto.createHmac('sha256', HMAC_KEY).update(body).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Internal: Send the event to the telemetry endpoint.
 * AbortController ensures we don't hang longer than 2 seconds.
 * All errors are swallowed — telemetry failures must never propagate.
 */
async function sendEvent(event: TelemetryEvent): Promise<void> {
  const controller = new AbortController();
  // 2s timeout — enough for a healthy network, short enough to not delay anything
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const body = JSON.stringify(event);
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // HMAC signature — lets the Edge Function verify the payload wasn't tampered.
        // The v2 endpoint accepts but does not require this header initially, allowing
        // older CLI versions (which don't send it) to continue working.
        'X-Signature': signPayload(body),
      },
      body,
      signal: controller.signal,
    });
  } catch {
    // Swallow everything: network errors, AbortError, JSON serialization errors.
    // Telemetry failures are silent — the CLI command already completed.
  } finally {
    clearTimeout(timer);
  }
}
