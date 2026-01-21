import admin from 'firebase-admin';
import type { ClaudeInsightConfig, ParsedSession, Insight, Project } from '../types.js';

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
  const batch = firestore.batch();

  // Upsert project
  const projectRef = firestore.collection('projects').doc(generateProjectId(session.projectPath));
  batch.set(
    projectRef,
    {
      name: session.projectName,
      path: session.projectPath,
      lastActivity: admin.firestore.Timestamp.fromDate(session.endedAt),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Increment session count
  batch.update(projectRef, {
    sessionCount: admin.firestore.FieldValue.increment(1),
  });

  // Upload session
  const sessionRef = firestore.collection('sessions').doc(session.id);
  batch.set(sessionRef, {
    projectId: generateProjectId(session.projectPath),
    projectName: session.projectName,
    projectPath: session.projectPath,
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
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Upload insights to Firestore
 */
export async function uploadInsights(insights: Insight[]): Promise<void> {
  if (insights.length === 0) return;

  const firestore = getDb();

  // Batch writes (max 500 per batch)
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = firestore.batch();
  let operationCount = 0;

  for (const insight of insights) {
    const insightRef = firestore.collection('insights').doc(insight.id);
    currentBatch.set(insightRef, {
      sessionId: insight.sessionId,
      projectId: insight.projectId,
      projectName: insight.projectName,
      type: insight.type,
      title: insight.title,
      content: insight.content,
      summary: insight.summary,
      bullets: insight.bullets,
      confidence: insight.confidence,
      source: insight.source,
      metadata: insight.metadata,
      timestamp: admin.firestore.Timestamp.fromDate(insight.timestamp),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

  // Execute all batches
  await Promise.all(batches.map((batch) => batch.commit()));
}

/**
 * Upload messages to Firestore (optional, for full replay)
 */
export async function uploadMessages(
  session: ParsedSession,
  options: { includeMessages?: boolean } = {}
): Promise<void> {
  if (!options.includeMessages || session.messages.length === 0) return;

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
 * Get recent insights with optional filters
 */
export async function getRecentInsights(
  limit: number = 20,
  filters?: {
    type?: 'decision' | 'learning' | 'workitem';
    project?: string;
    todayOnly?: boolean;
  }
): Promise<Insight[]> {
  const firestore = getDb();

  let query: admin.firestore.Query = firestore
    .collection('insights')
    .orderBy('timestamp', 'desc')
    .limit(limit);

  if (filters?.type) {
    query = query.where('type', '==', filters.type);
  }

  if (filters?.project) {
    query = query.where('projectName', '==', filters.project);
  }

  if (filters?.todayOnly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(today));
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      sessionId: data.sessionId,
      projectId: data.projectId,
      projectName: data.projectName,
      type: data.type,
      title: data.title,
      content: data.content,
      summary: data.summary || '',
      bullets: data.bullets || [],
      confidence: data.confidence,
      source: data.source,
      metadata: data.metadata,
      timestamp: data.timestamp?.toDate() || new Date(),
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
 * Generate a stable project ID from path
 */
function generateProjectId(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `proj_${Math.abs(hash).toString(16)}`;
}

/**
 * Truncate content to max length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength - 20) + '\n... [truncated]';
}
