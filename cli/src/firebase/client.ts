import admin from 'firebase-admin';
import type { ClaudeInsightConfig, ParsedSession, Project } from '../types.js';
import { generateStableProjectId, getDeviceInfo } from '../utils/device.js';

let db: admin.firestore.Firestore | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebase(config: ClaudeInsightConfig): void {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
    }),
  });

  db = admin.firestore();
}

/**
 * Get Firestore instance
 */
function getDb(): admin.firestore.Firestore {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase first.');
  }
  return db;
}

/**
 * Upload a session to Firestore
 */
export async function uploadSession(session: ParsedSession, isForceSync = false): Promise<void> {
  const firestore = getDb();

  // Generate stable project ID (prefers git remote URL)
  const { projectId, source: projectIdSource, gitRemoteUrl } = generateStableProjectId(session.projectPath);

  // Get device info for multi-device support
  const deviceInfo = getDeviceInfo();

  // Check if session already exists (for idempotent session count)
  const sessionRef = firestore.collection('sessions').doc(session.id);
  const existingSession = await sessionRef.get();
  const isNewSession = !existingSession.exists;

  const batch = firestore.batch();

  // Upsert project
  const projectRef = firestore.collection('projects').doc(projectId);
  batch.set(
    projectRef,
    {
      name: session.projectName,
      path: session.projectPath,
      gitRemoteUrl: gitRemoteUrl,
      projectIdSource: projectIdSource,
      lastActivity: admin.firestore.Timestamp.fromDate(session.endedAt),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Only increment session count for NEW sessions (idempotent)
  if (isNewSession) {
    const incrementFields: Record<string, admin.firestore.FieldValue> = {
      sessionCount: admin.firestore.FieldValue.increment(1),
    };
    if (!isForceSync && session.usage) {
      incrementFields.totalInputTokens = admin.firestore.FieldValue.increment(session.usage.totalInputTokens);
      incrementFields.totalOutputTokens = admin.firestore.FieldValue.increment(session.usage.totalOutputTokens);
      incrementFields.cacheCreationTokens = admin.firestore.FieldValue.increment(session.usage.cacheCreationTokens);
      incrementFields.cacheReadTokens = admin.firestore.FieldValue.increment(session.usage.cacheReadTokens);
      incrementFields.estimatedCostUsd = admin.firestore.FieldValue.increment(session.usage.estimatedCostUsd);
    }
    batch.update(projectRef, incrementFields);
  }

  // Upload session with device info
  batch.set(sessionRef, {
    projectId: projectId,
    projectName: session.projectName,
    projectPath: session.projectPath,
    gitRemoteUrl: gitRemoteUrl,
    summary: session.summary,
    generatedTitle: session.generatedTitle,
    titleSource: session.titleSource,
    sessionCharacter: session.sessionCharacter,
    startedAt: admin.firestore.Timestamp.fromDate(session.startedAt),
    endedAt: admin.firestore.Timestamp.fromDate(session.endedAt),
    messageCount: session.messageCount,
    userMessageCount: session.userMessageCount,
    assistantMessageCount: session.assistantMessageCount,
    toolCallCount: session.toolCallCount,
    gitBranch: session.gitBranch,
    claudeVersion: session.claudeVersion,
    sourceTool: session.sourceTool ?? 'claude-code',
    // Device info for multi-device tracking
    deviceId: deviceInfo.deviceId,
    deviceHostname: deviceInfo.hostname,
    devicePlatform: deviceInfo.platform,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    // Usage stats (conditional — absent for older sessions without token data)
    ...(session.usage ? {
      totalInputTokens: session.usage.totalInputTokens,
      totalOutputTokens: session.usage.totalOutputTokens,
      cacheCreationTokens: session.usage.cacheCreationTokens,
      cacheReadTokens: session.usage.cacheReadTokens,
      estimatedCostUsd: session.usage.estimatedCostUsd,
      modelsUsed: session.usage.modelsUsed,
      primaryModel: session.usage.primaryModel,
      usageSource: session.usage.usageSource,
    } : {}),
  });

  // Atomically increment usage stats for new sessions (non-force only)
  if (isNewSession && !isForceSync && session.usage) {
    const statsRef = firestore.collection('stats').doc('usage');
    batch.set(statsRef, {
      totalInputTokens: admin.firestore.FieldValue.increment(session.usage.totalInputTokens),
      totalOutputTokens: admin.firestore.FieldValue.increment(session.usage.totalOutputTokens),
      cacheCreationTokens: admin.firestore.FieldValue.increment(session.usage.cacheCreationTokens),
      cacheReadTokens: admin.firestore.FieldValue.increment(session.usage.cacheReadTokens),
      estimatedCostUsd: admin.firestore.FieldValue.increment(session.usage.estimatedCostUsd),
      sessionsWithUsage: admin.firestore.FieldValue.increment(1),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
}

/**
 * Upload messages to Firestore for LLM analysis
 */
export async function uploadMessages(session: ParsedSession): Promise<void> {
  if (session.messages.length === 0) return;

  const firestore = getDb();
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = firestore.batch();
  let operationCount = 0;

  for (const message of session.messages) {
    const messageRef = firestore.collection('messages').doc(message.id);
    currentBatch.set(messageRef, {
      sessionId: message.sessionId,
      type: message.type,
      content: truncateContent(message.content, 10000),
      thinking: message.thinking
        ? truncateContent(message.thinking, 5000)
        : null,
      toolCalls: message.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: JSON.stringify(tc.input).slice(0, 1000),
      })),
      toolResults: message.toolResults.map((tr) => ({
        toolUseId: tr.toolUseId,
        output: truncateContent(tr.output, 2000),
      })),
      timestamp: admin.firestore.Timestamp.fromDate(message.timestamp),
      parentId: message.parentId,
      // Per-message usage (assistant messages only)
      ...(message.usage ? {
        usage: {
          inputTokens: message.usage.inputTokens,
          outputTokens: message.usage.outputTokens,
          cacheCreationTokens: message.usage.cacheCreationTokens,
          cacheReadTokens: message.usage.cacheReadTokens,
          model: message.usage.model,
          estimatedCostUsd: message.usage.estimatedCostUsd,
        },
      } : {}),
    });

    operationCount++;
    if (operationCount >= 500) {
      batches.push(currentBatch);
      currentBatch = firestore.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    batches.push(currentBatch);
  }

  await Promise.all(batches.map((batch) => batch.commit()));
}

/**
 * Check if a session already exists
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  const firestore = getDb();
  const doc = await firestore.collection('sessions').doc(sessionId).get();
  return doc.exists;
}

/**
 * Get all projects
 */
export async function getProjects(): Promise<Project[]> {
  const firestore = getDb();
  const snapshot = await firestore.collection('projects').orderBy('lastActivity', 'desc').get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      path: data.path,
      sessionCount: data.sessionCount || 0,
      lastActivity: data.lastActivity?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}

/**
 * Get recent sessions
 */
export async function getRecentSessions(limit: number = 10): Promise<ParsedSession[]> {
  const firestore = getDb();
  const snapshot = await firestore
    .collection('sessions')
    .orderBy('endedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      projectPath: data.projectPath,
      projectName: data.projectName,
      summary: data.summary,
      startedAt: data.startedAt?.toDate() || new Date(),
      endedAt: data.endedAt?.toDate() || new Date(),
      messageCount: data.messageCount,
      userMessageCount: data.userMessageCount,
      assistantMessageCount: data.assistantMessageCount,
      toolCallCount: data.toolCallCount,
      messages: [],
      insights: [],
      gitBranch: data.gitBranch,
      claudeVersion: data.claudeVersion,
      generatedTitle: data.generatedTitle || null,
      titleSource: data.titleSource || null,
      sessionCharacter: data.sessionCharacter || null,
    };
  });
}


/**
 * Recalculate usage stats from all sessions in Firestore.
 * Used after --force sync to reconcile totals.
 */
export async function recalculateUsageStats(): Promise<{
  sessionsWithUsage: number;
  totalTokens: number;
  estimatedCostUsd: number;
}> {
  const firestore = getDb();

  // Query all sessions that have usage data
  const snapshot = await firestore
    .collection('sessions')
    .where('usageSource', '==', 'jsonl')
    .get();

  // Aggregate global + per-project totals
  const global = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0,
    sessionsWithUsage: 0,
  };

  const perProject: Record<string, {
    totalInputTokens: number;
    totalOutputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
  }> = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    global.totalInputTokens += data.totalInputTokens ?? 0;
    global.totalOutputTokens += data.totalOutputTokens ?? 0;
    global.cacheCreationTokens += data.cacheCreationTokens ?? 0;
    global.cacheReadTokens += data.cacheReadTokens ?? 0;
    global.estimatedCostUsd += data.estimatedCostUsd ?? 0;
    global.sessionsWithUsage++;

    const pid = data.projectId;
    if (pid) {
      if (!perProject[pid]) {
        perProject[pid] = {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          estimatedCostUsd: 0,
        };
      }
      perProject[pid].totalInputTokens += data.totalInputTokens ?? 0;
      perProject[pid].totalOutputTokens += data.totalOutputTokens ?? 0;
      perProject[pid].cacheCreationTokens += data.cacheCreationTokens ?? 0;
      perProject[pid].cacheReadTokens += data.cacheReadTokens ?? 0;
      perProject[pid].estimatedCostUsd += data.estimatedCostUsd ?? 0;
    }
  }

  // Write global stats (overwrite, not merge)
  const statsRef = firestore.collection('stats').doc('usage');
  await statsRef.set({
    ...global,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update each project's usage fields
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = firestore.batch();
  let opCount = 0;

  for (const [projectId, usage] of Object.entries(perProject)) {
    const projectRef = firestore.collection('projects').doc(projectId);
    currentBatch.set(projectRef, usage, { merge: true });
    opCount++;
    if (opCount >= 500) {
      batches.push(currentBatch);
      currentBatch = firestore.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);
  await Promise.all(batches.map(b => b.commit()));

  const totalTokens = global.totalInputTokens + global.totalOutputTokens
    + global.cacheCreationTokens + global.cacheReadTokens;

  return {
    sessionsWithUsage: global.sessionsWithUsage,
    totalTokens,
    estimatedCostUsd: global.estimatedCostUsd,
  };
}

/**
 * Truncate content to max length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength - 20) + '\n... [truncated]';
}
