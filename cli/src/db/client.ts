import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { runMigrations, type MigrationResult } from './migrate.js';

const DB_DIR = join(homedir(), '.code-insights');
const DB_PATH = join(DB_DIR, 'data.db');

let _db: Database.Database | null = null;
let _migrationResult: MigrationResult | null = null;

/**
 * Get (or initialize) the singleton SQLite database instance.
 * WAL mode is enabled for concurrent reads during CLI sync.
 * Migrations run automatically on first call.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
  }

  const db = new Database(DB_PATH);

  // WAL mode: allows concurrent reads while CLI writes
  db.pragma('journal_mode = WAL');
  // Wait up to 5s if another writer holds the lock (e.g., dashboard writing insights)
  db.pragma('busy_timeout = 5000');
  // Foreign key enforcement
  db.pragma('foreign_keys = ON');

  _migrationResult = runMigrations(db);

  _db = db;

  // Ensure WAL checkpoint runs on process exit so no data is left in the WAL file.
  // Registered here (on first open) so it fires whether process exits normally or
  // via an unhandled exception that reaches the exit handler.
  process.on('exit', () => {
    closeDb();
  });

  return _db;
}

/**
 * Get the migration result from the last getDb() call.
 * Returns null if the DB has not been initialized yet.
 * Used by sync.ts to detect V6 migration and trigger auto force-sync.
 */
export function getMigrationResult(): MigrationResult | null {
  return _migrationResult;
}

/**
 * Close the database connection. Used in tests and graceful shutdown.
 * Also called by the process 'exit' handler to ensure WAL checkpointing.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
  _migrationResult = null;
}

/**
 * Get the database file path.
 */
export function getDbPath(): string {
  return DB_PATH;
}
