// Shared types for ClaudeInsight web app

export interface Project {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: Date;
  createdAt: Date;
}

export interface Session {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  summary: string | null;
  // New title fields
  generatedTitle: string | null;
  titleSource: 'claude' | 'user_message' | 'insight' | 'character' | 'fallback' | null;
  sessionCharacter: 'deep_focus' | 'bug_hunt' | 'feature_build' | 'exploration' | 'refactor' | 'learning' | 'quick_task' | null;
  startedAt: Date;
  endedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  gitBranch: string | null;
  claudeVersion: string | null;
  syncedAt: Date;
}

export interface Insight {
  id: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  type: 'decision' | 'learning' | 'workitem' | 'effort';
  title: string;
  content: string;
  // New structured fields
  summary: string;
  bullets: string[];
  confidence: number;
  source: 'pattern' | 'llm' | 'claude_insight';
  metadata: InsightMetadata;
  timestamp: Date;
  createdAt: Date;
}

export interface InsightMetadata {
  alternatives?: string[];
  reasoning?: string;
  files?: string[];
  workType?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';
  tokens?: number;
  duration?: number;
}

export interface Message {
  id: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolCall[];
  timestamp: Date;
  parentId: string | null;
}

export interface ToolCall {
  name: string;
  input: string;
}

// Filter types
export interface SessionFilters {
  projectId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface InsightFilters {
  projectId?: string;
  sessionId?: string;
  type?: Insight['type'];
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

// Analytics types
export interface DailyStats {
  date: string;
  sessionCount: number;
  messageCount: number;
  insightCount: number;
}

export interface ProjectStats {
  projectId: string;
  projectName: string;
  sessionCount: number;
  totalDuration: number;
  insightCounts: {
    decision: number;
    learning: number;
    workitem: number;
    effort: number;
  };
}
