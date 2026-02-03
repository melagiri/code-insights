import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { hostname, platform, userInfo } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = join(process.env.HOME || '~', '.code-insights');
const DEVICE_ID_FILE = join(CONFIG_DIR, 'device-id');

/**
 * Get or create a persistent device ID.
 * Stored in ~/.code-insights/device-id
 */
export function getDeviceId(): string {
  // Check if device ID already exists
  if (existsSync(DEVICE_ID_FILE)) {
    const existingId = readFileSync(DEVICE_ID_FILE, 'utf-8').trim();
    if (existingId) {
      return existingId;
    }
  }

  // Generate new device ID based on machine characteristics
  const machineInfo = [
    hostname(),
    platform(),
    userInfo().username,
    process.arch,
  ].join('-');

  const deviceId = createHash('sha256')
    .update(machineInfo)
    .digest('hex')
    .slice(0, 12);

  // Persist the device ID
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(DEVICE_ID_FILE, deviceId, 'utf-8');

  return deviceId;
}

/**
 * Get device information for session metadata
 */
export function getDeviceInfo(): {
  deviceId: string;
  hostname: string;
  platform: string;
  username: string;
} {
  return {
    deviceId: getDeviceId(),
    hostname: hostname(),
    platform: platform(),
    username: userInfo().username,
  };
}

/**
 * Get git remote URL for a project path.
 * Returns null if not a git repo or no remote configured.
 */
export function getGitRemoteUrl(projectPath: string): string | null {
  try {
    // Use execFileSync for safety - no shell spawning
    const result = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr
    });
    return normalizeGitUrl(result.trim());
  } catch {
    // Not a git repo or no origin remote
    return null;
  }
}

/**
 * Normalize git URL to a canonical form.
 * Handles SSH, HTTPS, and various formats.
 *
 * Examples:
 * - git@github.com:user/repo.git -> github.com/user/repo
 * - https://github.com/user/repo.git -> github.com/user/repo
 * - ssh://git@github.com/user/repo -> github.com/user/repo
 */
function normalizeGitUrl(url: string): string {
  let normalized = url;

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '');

  // Handle SSH format: git@github.com:user/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Handle SSH URL format: ssh://git@github.com/user/repo
  const sshUrlMatch = normalized.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshUrlMatch) {
    return `${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  // Handle HTTPS format: https://github.com/user/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  // Fallback - return as is
  return normalized;
}

/**
 * Generate a stable project ID.
 *
 * Priority:
 * 1. Git remote URL (most stable across devices)
 * 2. Project path hash (fallback for non-git projects)
 */
export function generateStableProjectId(projectPath: string): {
  projectId: string;
  source: 'git-remote' | 'path-hash';
  gitRemoteUrl: string | null;
} {
  const gitRemoteUrl = getGitRemoteUrl(projectPath);

  if (gitRemoteUrl) {
    // Use git remote URL for stable ID
    const projectId = createHash('sha256')
      .update(gitRemoteUrl)
      .digest('hex')
      .slice(0, 16);

    return {
      projectId,
      source: 'git-remote',
      gitRemoteUrl,
    };
  }

  // Fallback to path hash (will differ across devices)
  const projectId = createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .slice(0, 16);

  return {
    projectId,
    source: 'path-hash',
    gitRemoteUrl: null,
  };
}
