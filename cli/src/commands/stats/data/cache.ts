// ──────────────────────────────────────────────────────
// Stats cache — disk-based parsed session store
//
// Stores pre-parsed SessionRow[] keyed by source file path
// with mtime-based invalidation. Lives at:
//   ~/.code-insights/stats-cache.json
// ──────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type { ParsedSession } from '../../../types.js';
import type { SessionRow } from './types.js';
import { generateStableProjectId } from '../../../utils/device.js';
import { ensureConfigDir } from '../../../utils/config.js';
import { splitVirtualPath } from '../../../utils/paths.js';
import { getAllProviders } from '../../../providers/registry.js';

// ──────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────

const CACHE_PATH = path.join(os.homedir(), '.code-insights', 'stats-cache.json');

// ──────────────────────────────────────────────────────
// Internal interfaces
// ──────────────────────────────────────────────────────

interface StatsCacheEntry {
  lastModified: string;
  provider: string;
  rows: SessionRow[];
}

interface StatsCacheFile {
  version: number;
  lastRefresh: string;
  entries: Record<string, StatsCacheEntry>;
}

// ──────────────────────────────────────────────────────
// Module-level projectId cache — avoids repeated git
// process spawns for the same project path
// ──────────────────────────────────────────────────────

const projectIdCache = new Map<string, string>();

function getCachedProjectId(projectPath: string): string {
  const existing = projectIdCache.get(projectPath);
  if (existing) return existing;
  const { projectId } = generateStableProjectId(projectPath);
  projectIdCache.set(projectPath, projectId);
  return projectId;
}

// ──────────────────────────────────────────────────────
// Exported helpers
// ──────────────────────────────────────────────────────

/**
 * Transform the CLI's ParsedSession into the stats SessionRow shape.
 * Uses a module-level cache for projectId to avoid repeated git spawns.
 */
export function parsedSessionToRow(session: ParsedSession): SessionRow {
  const projectId = getCachedProjectId(session.projectPath);

  return {
    // identity
    id: session.id,
    projectId,
    projectName: session.projectName,

    // timing
    startedAt: session.startedAt,
    endedAt: session.endedAt,

    // counts
    messageCount: session.messageCount,
    userMessageCount: session.userMessageCount,
    assistantMessageCount: session.assistantMessageCount,
    toolCallCount: session.toolCallCount,

    // cost / usage (optional)
    estimatedCostUsd: session.usage?.estimatedCostUsd,
    totalInputTokens: session.usage?.totalInputTokens,
    totalOutputTokens: session.usage?.totalOutputTokens,
    cacheCreationTokens: session.usage?.cacheCreationTokens,
    cacheReadTokens: session.usage?.cacheReadTokens,

    // metadata
    primaryModel: session.usage?.primaryModel,
    modelsUsed: session.usage?.modelsUsed,
    generatedTitle: session.generatedTitle ?? undefined,
    customTitle: session.customTitle,
    summary: session.summary ?? undefined,
    sessionCharacter: session.sessionCharacter ?? undefined,
    sourceTool: session.sourceTool,
    usageSource: session.usage?.usageSource,
  };
}

// ──────────────────────────────────────────────────────
// StatsCache class
// ──────────────────────────────────────────────────────

export class StatsCache {
  private data: StatsCacheFile;
  private dirty: boolean;

  constructor() {
    this.dirty = false;
    this.data = this.load();
  }

  /**
   * Refresh the cache by discovering and parsing sessions from all providers.
   * Returns counts of new and total sessions.
   */
  async refresh(): Promise<{ newSessions: number; totalSessions: number }> {
    const providers = getAllProviders();
    let newSessions = 0;

    // Collect all discovered file paths (keyed by provider name for metadata)
    const allDiscoveredPaths = new Set<string>();

    for (const provider of providers) {
      const providerName = provider.getProviderName();
      let filePaths: string[];
      try {
        filePaths = await provider.discover();
      } catch {
        // If discovery fails for a provider, skip it
        continue;
      }

      for (const filePath of filePaths) {
        allDiscoveredPaths.add(filePath);

        // Check mtime for cache invalidation
        const { realPath } = splitVirtualPath(filePath);
        let currentMtime: string;
        try {
          currentMtime = fs.statSync(realPath).mtime.toISOString();
        } catch {
          // File no longer accessible, skip
          continue;
        }

        const cached = this.data.entries[filePath];
        if (cached && cached.lastModified === currentMtime) {
          // Cache hit — mtime unchanged
          continue;
        }

        // Cache miss — parse the file
        let session: ParsedSession | null;
        try {
          session = await provider.parse(filePath);
        } catch {
          // Parse error — skip this file
          continue;
        }

        if (!session) continue;

        const row = parsedSessionToRow(session);
        this.data.entries[filePath] = {
          lastModified: currentMtime,
          provider: providerName,
          rows: [row],
        };
        this.dirty = true;
        newSessions++;
      }
    }

    // Prune entries for file paths that no longer exist in any provider's discovery
    for (const cachedPath of Object.keys(this.data.entries)) {
      if (!allDiscoveredPaths.has(cachedPath)) {
        delete this.data.entries[cachedPath];
        this.dirty = true;
      }
    }

    // Persist if anything changed
    if (this.dirty) {
      this.data.lastRefresh = new Date().toISOString();
      this.save();
    }

    return { newSessions, totalSessions: this.getAllRows().length };
  }

  /**
   * Return all cached session rows with dates properly deserialized.
   * JSON serialization turns Date objects into ISO strings — reconstruct them.
   */
  getAllRows(): SessionRow[] {
    const rows: SessionRow[] = [];
    for (const entry of Object.values(this.data.entries)) {
      for (const row of entry.rows) {
        rows.push({
          ...row,
          startedAt: new Date(row.startedAt),
          endedAt: new Date(row.endedAt),
        });
      }
    }
    return rows;
  }

  // ──────────────────────────────────────────────────────
  // Private methods
  // ──────────────────────────────────────────────────────

  private load(): StatsCacheFile {
    try {
      if (!fs.existsSync(CACHE_PATH)) {
        return this.empty();
      }
      const content = fs.readFileSync(CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(content) as StatsCacheFile;
      if (parsed.version !== 1) {
        return this.empty();
      }
      return parsed;
    } catch {
      return this.empty();
    }
  }

  private save(): void {
    ensureConfigDir();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(this.data, null, 2));
    this.dirty = false;
  }

  private empty(): StatsCacheFile {
    return { version: 1, lastRefresh: '', entries: {} };
  }
}
