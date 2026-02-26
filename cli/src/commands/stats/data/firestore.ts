// ──────────────────────────────────────────────────────
// Firestore data source for stats commands
// ──────────────────────────────────────────────────────

import admin from 'firebase-admin';
import type { ClaudeInsightConfig } from '../../../types.js';
import { initializeFirebase, getDb, getProjects } from '../../../firebase/client.js';
import type {
  StatsDataSource,
  SessionRow,
  SessionQueryOptions,
  UsageStatsDoc,
  ProjectResolution,
  PrepareResult,
  StatsFlags,
} from './types.js';
import { ProjectNotFoundError, FirestoreIndexError } from './types.js';
import { findSimilarNames } from './fuzzy-match.js';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

/** Checks if error is a Firestore FAILED_PRECONDITION (missing composite index) */
function isFirestoreIndexError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code: number }).code === 9;
  }
  return false;
}

/** Extracts the Firebase console index-creation URL from an error message */
function extractIndexUrl(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: string }).message;
    const match = message.match(/(https:\/\/console\.firebase\.google\.com\/[^\s"]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// ──────────────────────────────────────────────────────
// Document mapper
// ──────────────────────────────────────────────────────

/** Maps a Firestore document to the universal SessionRow shape */
function docToSessionRow(doc: admin.firestore.DocumentSnapshot): SessionRow {
  const data = doc.data();
  if (!data) throw new Error(`Session document ${doc.id} has no data`);
  return {
    id: doc.id,
    projectId: data.projectId,
    projectName: data.projectName,
    startedAt: data.startedAt?.toDate() ?? new Date(),
    endedAt: data.endedAt?.toDate() ?? new Date(),
    messageCount: data.messageCount ?? 0,
    userMessageCount: data.userMessageCount ?? 0,
    assistantMessageCount: data.assistantMessageCount ?? 0,
    toolCallCount: data.toolCallCount ?? 0,
    estimatedCostUsd: data.estimatedCostUsd,
    totalInputTokens: data.totalInputTokens,
    totalOutputTokens: data.totalOutputTokens,
    cacheCreationTokens: data.cacheCreationTokens,
    cacheReadTokens: data.cacheReadTokens,
    primaryModel: data.primaryModel,
    modelsUsed: data.modelsUsed,
    generatedTitle: data.generatedTitle,
    customTitle: data.customTitle,
    summary: data.summary,
    sessionCharacter: data.sessionCharacter,
    sourceTool: data.sourceTool,
    usageSource: data.usageSource,
  };
}

// ──────────────────────────────────────────────────────
// FirestoreDataSource
// ──────────────────────────────────────────────────────

export class FirestoreDataSource implements StatsDataSource {
  readonly name = 'firestore';

  constructor(private config: ClaudeInsightConfig) {}

  async prepare(flags: StatsFlags): Promise<PrepareResult> {
    initializeFirebase(this.config);

    if (!flags.noSync) {
      try {
        const { runSync } = await import('../../sync.js');
        const result = await runSync({ quiet: true });
        if (result.syncedCount > 0) {
          return { message: `Synced ${result.syncedCount} new sessions`, dataChanged: true };
        }
        return { message: 'Up to date', dataChanged: false };
      } catch {
        return { message: 'Sync failed (showing cached data)', dataChanged: false };
      }
    }
    return { message: 'Sync skipped', dataChanged: false };
  }

  async getSessions(opts: SessionQueryOptions): Promise<SessionRow[]> {
    const firestore = getDb();
    let query: admin.firestore.Query = firestore.collection('sessions');

    if (opts.projectId) {
      query = query.where('projectId', '==', opts.projectId);
    }
    if (opts.sourceTool) {
      query = query.where('sourceTool', '==', opts.sourceTool);
    }
    if (opts.periodStart) {
      query = query.where('startedAt', '>=', admin.firestore.Timestamp.fromDate(opts.periodStart));
    }

    query = query.orderBy('startedAt', 'desc');

    try {
      const snapshot = await query.get();
      return snapshot.docs.map(docToSessionRow);
    } catch (error: unknown) {
      if (isFirestoreIndexError(error)) {
        const url = extractIndexUrl(error);
        throw new FirestoreIndexError(
          url
            ? `Missing Firestore index. Create it here: ${url}`
            : 'Missing Firestore composite index. Check the error details in Firebase console.',
          url ?? ''
        );
      }
      throw error;
    }
  }

  async getUsageStats(): Promise<UsageStatsDoc | null> {
    const firestore = getDb();
    const doc = await firestore.collection('stats').doc('usage').get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      totalInputTokens: data.totalInputTokens ?? 0,
      totalOutputTokens: data.totalOutputTokens ?? 0,
      cacheCreationTokens: data.cacheCreationTokens ?? 0,
      cacheReadTokens: data.cacheReadTokens ?? 0,
      estimatedCostUsd: data.estimatedCostUsd ?? 0,
      sessionsWithUsage: data.sessionsWithUsage ?? 0,
      lastUpdatedAt: data.lastUpdatedAt?.toDate() ?? new Date(),
    };
  }

  async resolveProjectId(name: string): Promise<ProjectResolution> {
    const projects = await getProjects();

    // Exact match (case-insensitive)
    const exact = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (exact) return { projectId: exact.id, projectName: exact.name };

    // Substring match
    const substring = projects.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
    if (substring.length === 1) return { projectId: substring[0].id, projectName: substring[0].name };

    // No match — throw with suggestions
    const suggestions = findSimilarNames(name, projects.map((p) => p.name));
    throw new ProjectNotFoundError(
      `Project "${name}" not found.`,
      name,
      projects.map((p) => ({ name: p.name })),
      suggestions,
    );
  }

  async getLastSession(opts?: Pick<SessionQueryOptions, 'sourceTool' | 'projectId'>): Promise<SessionRow | null> {
    const firestore = getDb();
    let query: admin.firestore.Query = firestore.collection('sessions');

    if (opts?.sourceTool) {
      query = query.where('sourceTool', '==', opts.sourceTool);
    }
    if (opts?.projectId) {
      query = query.where('projectId', '==', opts.projectId);
    }

    query = query.orderBy('startedAt', 'desc').limit(1);

    try {
      const snapshot = await query.get();
      if (snapshot.empty) return null;
      return docToSessionRow(snapshot.docs[0]);
    } catch (error: unknown) {
      if (isFirestoreIndexError(error)) {
        const url = extractIndexUrl(error);
        throw new FirestoreIndexError(
          url
            ? `Missing Firestore index. Create it here: ${url}`
            : 'Missing Firestore composite index. Check the error details in Firebase console.',
          url ?? ''
        );
      }
      throw error;
    }
  }
}
