import * as fs from 'fs';
import type { FirebaseServiceAccountJson, FirebaseWebConfig } from '../types.js';

export type FileReadResult<T> =
  | { success: true; data: T }
  | { success: false; error: 'not_found' | 'invalid_json' | 'permission_denied' | 'unknown'; message: string };

/**
 * Validate Firebase Service Account JSON structure
 */
export function validateServiceAccountJson(data: unknown): data is FirebaseServiceAccountJson {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  return (
    obj.type === 'service_account' &&
    typeof obj.project_id === 'string' &&
    typeof obj.private_key === 'string' &&
    typeof obj.client_email === 'string' &&
    (obj.private_key as string).includes('-----BEGIN PRIVATE KEY-----')
  );
}

/**
 * Check if data looks like a service account (for cross-type detection)
 */
export function looksLikeServiceAccount(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return obj.type === 'service_account' || typeof obj.private_key === 'string';
}

/**
 * Check if data looks like a web config (for cross-type detection)
 */
export function looksLikeWebConfig(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.apiKey === 'string' || typeof obj.authDomain === 'string';
}

/**
 * Validate Firebase Web SDK config structure
 */
export function validateWebConfig(data: unknown): data is FirebaseWebConfig {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.apiKey === 'string' &&
    typeof obj.authDomain === 'string' &&
    typeof obj.projectId === 'string' &&
    typeof obj.storageBucket === 'string' &&
    typeof obj.messagingSenderId === 'string' &&
    typeof obj.appId === 'string'
  );
}

/**
 * Resolve file path (expand ~ to home directory)
 */
export function resolveFilePath(filePath: string): string {
  return filePath.replace(/^~/, process.env.HOME || '');
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  const resolvedPath = resolveFilePath(filePath);
  return fs.existsSync(resolvedPath);
}

/**
 * Read and parse a JSON file with detailed error reporting
 */
export function readJsonFileWithError<T>(filePath: string): FileReadResult<T> {
  const resolvedPath = resolveFilePath(filePath);

  try {
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: 'not_found', message: `File not found: ${filePath}` };
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(content) as T;
    return { success: true, data };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: 'invalid_json', message: 'File contains invalid JSON' };
    }
    if (err instanceof Error && 'code' in err && err.code === 'EACCES') {
      return { success: false, error: 'permission_denied', message: 'Permission denied reading file' };
    }
    return { success: false, error: 'unknown', message: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

/**
 * Read and parse a JSON file (simple version, returns null on error)
 */
export function readJsonFile<T>(filePath: string): T | null {
  const result = readJsonFileWithError<T>(filePath);
  return result.success ? result.data : null;
}

/**
 * Extract service account config from JSON file
 */
export function extractServiceAccountConfig(json: FirebaseServiceAccountJson) {
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key,
  };
}

/**
 * Encode web config for URL parameter (base64url encoding per RFC 4648)
 *
 * The web app decodes this with:
 *   const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
 *   const json = atob(base64);
 *   const config = JSON.parse(json);
 */
export function encodeWebConfigForUrl(config: FirebaseWebConfig): string {
  const json = JSON.stringify(config);
  return Buffer.from(json, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate the web dashboard URL with embedded config
 *
 * Note: Firebase web API keys are designed for client-side use and are
 * restricted by Firestore security rules, not by key secrecy. However,
 * users should still avoid sharing this URL publicly.
 */
export function generateDashboardUrl(config: FirebaseWebConfig): string {
  const encodedConfig = encodeWebConfigForUrl(config);
  return `https://code-insights.ai/?config=${encodedConfig}`;
}
