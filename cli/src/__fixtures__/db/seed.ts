/**
 * Test helpers for database tests.
 *
 * Provides an in-memory SQLite database with migrations applied,
 * plus factory functions for building ParsedSession / ParsedMessage
 * objects with sensible defaults.
 */

import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import type { ParsedSession, ParsedMessage } from '../../types.js';

/**
 * Create a fresh in-memory SQLite database with all migrations applied.
 * Each call returns a brand-new isolated database.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

/**
 * Build a ParsedSession with sensible defaults.
 * Any field can be overridden via the `overrides` parameter.
 */
export function makeParsedSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  const now = new Date('2025-06-15T10:00:00Z');
  const later = new Date('2025-06-15T11:00:00Z');

  return {
    id: 'session-001',
    projectPath: '/home/user/my-project',
    projectName: 'my-project',
    summary: 'Test session summary',
    generatedTitle: 'Test Session Title',
    titleSource: 'fallback',
    sessionCharacter: 'quick_task',
    startedAt: now,
    endedAt: later,
    messageCount: 5,
    userMessageCount: 3,
    assistantMessageCount: 2,
    toolCallCount: 1,
    compactCount: 0,
    autoCompactCount: 0,
    slashCommands: [],
    gitBranch: 'main',
    claudeVersion: '1.0.0',
    sourceTool: 'claude-code',
    messages: [],
    ...overrides,
  };
}

/**
 * Build a ParsedMessage with sensible defaults.
 * Any field can be overridden via the `overrides` parameter.
 */
export function makeParsedMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: 'msg-001',
    sessionId: 'session-001',
    type: 'user',
    content: 'Hello, world!',
    thinking: null,
    toolCalls: [],
    toolResults: [],
    usage: null,
    timestamp: new Date('2025-06-15T10:00:00Z'),
    parentId: null,
    ...overrides,
  };
}
