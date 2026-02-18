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
export async function uploadSession(session: ParsedSession): Promise<void> {
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
    batch.update(projectRef, {
      sessionCount: admin.firestore.FieldValue.increment(1),
    });
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
      content: truncateContent(message.content, 10000), // Limit content size
      toolCalls: message.toolCalls.map((tc) => ({
        name: tc.name,
        input: JSON.stringify(tc.input).slice(0, 1000), // Limit input size
      })),
      timestamp: admin.firestore.Timestamp.fromDate(message.timestamp),
      parentId: message.parentId,
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
 * Truncate content to max length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength - 20) + '\n... [truncated]';
}
