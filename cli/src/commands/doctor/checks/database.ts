import * as fs from 'fs';
import { getDb, getDbPath } from '../../../db/client.js';
import { CURRENT_SCHEMA_VERSION } from '../../../db/schema.js';
import type { Check } from '../types.js';

export function databaseChecks(): Check[] {
  return [
    {
      id: 'db.open',
      label: 'Database',
      gate: true,
      run: async () => {
        try {
          getDb();
          return { id: 'db.open', label: 'Database', status: 'pass', detail: getDbPath() };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isBindingMismatch = msg.includes('NODE_MODULE_VERSION') || msg.includes('was compiled against');
          return {
            id: 'db.open',
            label: 'Database',
            status: 'fail',
            detail: msg,
            hint: isBindingMismatch
              ? 'Run: npm rebuild better-sqlite3'
              : 'Run: code-insights init',
            fix: isBindingMismatch
              ? async () => {
                  const { execFileSync } = await import('child_process');
                  execFileSync('npm', ['rebuild', 'better-sqlite3'], { stdio: 'pipe' });
                }
              : undefined,
            fixLabel: isBindingMismatch ? 'Rebuild better-sqlite3 native bindings' : undefined,
          };
        }
      },
    },
    {
      id: 'db.schema_version',
      label: 'Schema version',
      run: async () => {
        try {
          const db = getDb();
          const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
          const version = row.v ?? 0;
          if (version === CURRENT_SCHEMA_VERSION) {
            return { id: 'db.schema_version', label: 'Schema version', status: 'pass', detail: `v${version}` };
          }
          if (version > 0 && version < CURRENT_SCHEMA_VERSION) {
            return {
              id: 'db.schema_version',
              label: 'Schema version',
              status: 'warn',
              detail: `v${version} (expected v${CURRENT_SCHEMA_VERSION})`,
              hint: 'Schema will auto-migrate on next sync',
            };
          }
          return {
            id: 'db.schema_version',
            label: 'Schema version',
            status: 'fail',
            detail: 'schema_version table missing or empty',
          };
        } catch {
          return { id: 'db.schema_version', label: 'Schema version', status: 'fail', detail: 'Could not read schema version' };
        }
      },
    },
    {
      id: 'db.integrity',
      label: 'Integrity check',
      run: async () => {
        try {
          const db = getDb();
          const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
          if (row.integrity_check === 'ok') {
            return { id: 'db.integrity', label: 'Integrity check', status: 'pass' };
          }
          return { id: 'db.integrity', label: 'Integrity check', status: 'fail', detail: row.integrity_check };
        } catch (err) {
          return { id: 'db.integrity', label: 'Integrity check', status: 'fail', detail: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      id: 'db.wal_size',
      label: 'WAL size',
      run: async () => {
        const walPath = getDbPath() + '-wal';
        if (!fs.existsSync(walPath)) {
          return { id: 'db.wal_size', label: 'WAL size', status: 'pass', detail: 'No WAL file' };
        }
        const stats = fs.statSync(walPath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB < 50) {
          return { id: 'db.wal_size', label: 'WAL size', status: 'pass', detail: `${sizeMB.toFixed(1)} MB` };
        }
        return {
          id: 'db.wal_size',
          label: 'WAL size',
          status: 'warn',
          detail: `${sizeMB.toFixed(1)} MB (> 50 MB)`,
          hint: 'Run: code-insights doctor --fix (will checkpoint WAL)',
          fix: async () => {
            const db = getDb();
            db.pragma('wal_checkpoint(TRUNCATE)');
          },
          fixLabel: 'Checkpoint WAL',
        };
      },
    },
    {
      id: 'db.null_timestamps',
      label: 'Session timestamps',
      run: async () => {
        try {
          const db = getDb();
          const row = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE started_at IS NULL').get() as { cnt: number };
          if (row.cnt === 0) {
            return { id: 'db.null_timestamps', label: 'Session timestamps', status: 'pass' };
          }
          return {
            id: 'db.null_timestamps',
            label: 'Session timestamps',
            status: 'warn',
            detail: `${row.cnt} session(s) with NULL started_at — dashboard won't show these`,
          };
        } catch {
          return { id: 'db.null_timestamps', label: 'Session timestamps', status: 'skip' };
        }
      },
    },
    {
      id: 'db.legacy_source_tool',
      label: 'Source tool values',
      run: async () => {
        try {
          const db = getDb();
          const knownTools = ['claude-code', 'cursor', 'codex-cli', 'copilot-cli', 'copilot', 'pi'];
          const placeholders = knownTools.map(() => '?').join(', ');
          const row = db.prepare(
            `SELECT COUNT(*) as cnt FROM sessions WHERE source_tool NOT IN (${placeholders})`
          ).get(...knownTools) as { cnt: number };
          if (row.cnt === 0) {
            return { id: 'db.legacy_source_tool', label: 'Source tool values', status: 'pass' };
          }
          return {
            id: 'db.legacy_source_tool',
            label: 'Source tool values',
            status: 'warn',
            detail: `${row.cnt} session(s) with unrecognized source_tool — dashboard filter may not show these`,
          };
        } catch {
          return { id: 'db.legacy_source_tool', label: 'Source tool values', status: 'skip' };
        }
      },
    },
    {
      id: 'db.orphaned_queue',
      label: 'Orphaned queue items',
      run: async () => {
        try {
          const db = getDb();
          const row = db.prepare(
            `SELECT COUNT(*) as cnt FROM analysis_queue LEFT JOIN sessions ON analysis_queue.session_id = sessions.id WHERE sessions.id IS NULL`
          ).get() as { cnt: number };
          if (row.cnt === 0) {
            return { id: 'db.orphaned_queue', label: 'Orphaned queue items', status: 'pass' };
          }
          return {
            id: 'db.orphaned_queue',
            label: 'Orphaned queue items',
            status: 'warn',
            detail: `${row.cnt} queue item(s) reference deleted sessions`,
          };
        } catch {
          return { id: 'db.orphaned_queue', label: 'Orphaned queue items', status: 'skip' };
        }
      },
    },
  ];
}
