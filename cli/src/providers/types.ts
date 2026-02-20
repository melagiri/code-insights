import type { ParsedSession } from '../types.js';

/**
 * SessionProvider interface - each tool (Claude Code, Cursor, Codex, etc.) implements this
 */
export interface SessionProvider {
  /** Unique provider identifier (e.g., 'claude-code', 'cursor') */
  getProviderName(): string;

  /** Discover session files/databases on this machine */
  discover(options?: { projectFilter?: string }): Promise<string[]>;

  /** Parse a single session file into normalized format */
  parse(filePath: string): Promise<ParsedSession | null>;
}
