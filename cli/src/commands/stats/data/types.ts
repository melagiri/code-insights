// ──────────────────────────────────────────────────────
// Stats command — Foundation types
// ──────────────────────────────────────────────────────

/** Time period for filtering sessions */
export type Period = '7d' | '30d' | '90d' | 'all';

/** Options passed to data source query methods */
export interface SessionQueryOptions {
  periodStart?: Date;
  projectId?: string;
  sourceTool?: string;
}

/**
 * Universal session representation.
 *
 * Both Firestore and local data sources produce this shape.
 * Required fields are guaranteed; optional fields depend on
 * whether usage/cost data was captured during the session.
 */
export interface SessionRow {
  // identity
  id: string;
  projectId: string;
  projectName: string;

  // timing
  startedAt: Date;
  endedAt: Date;

  // counts
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;

  // cost / usage (optional — only present when usage data was captured)
  estimatedCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;

  // metadata (optional)
  primaryModel?: string;
  modelsUsed?: string[];
  generatedTitle?: string;
  customTitle?: string;
  summary?: string;
  sessionCharacter?: string;
  // Required: SQLite schema has source_tool NOT NULL DEFAULT 'claude-code'
  sourceTool: string;
  usageSource?: string;
}

/** Resolved project identity */
export interface ProjectResolution {
  projectId: string;
  projectName: string;
}

/** Result of a data source prepare step */
export interface PrepareResult {
  message: string;
  dataChanged: boolean;
}

/** Aggregated usage statistics document */
export interface UsageStatsDoc {
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  sessionsWithUsage: number;
  lastUpdatedAt: Date;
}

/**
 * CLI flags for the stats command.
 *
 * Defined here (not in shared.ts) to avoid circular imports —
 * shared.ts re-exports this type.
 */
export interface StatsFlags {
  period: Period;
  project?: string;
  source?: string;
  noSync: boolean;
}

/**
 * Contract that every data source must implement.
 *
 * Both FirestoreDataSource and LocalDataSource satisfy this
 * interface, allowing the stats commands to be data-source agnostic.
 */
export interface StatsDataSource {
  readonly name: string;
  getSessions(opts: SessionQueryOptions): Promise<SessionRow[]>;
  getUsageStats(): Promise<UsageStatsDoc | null>;
  resolveProjectId(name: string): Promise<ProjectResolution>;
  getLastSession(opts?: Pick<SessionQueryOptions, 'sourceTool' | 'projectId'>): Promise<SessionRow | null>;
  prepare(flags: StatsFlags): Promise<PrepareResult>;
}

// ──────────────────────────────────────────────────────
// Aggregated output types (produced by the aggregation layer,
// consumed by renderers and action handlers)
// ──────────────────────────────────────────────────────

/** Single point on a time-series chart */
export interface TimeSeriesPoint {
  date: string;
  value: number;
}

/** A named metric with count, cost, and percentage */
export interface GroupedMetric {
  name: string;
  count: number;
  cost: number;
  percent: number;
}

/** Stats for a single calendar day */
export interface DayStats {
  sessionCount: number;
  totalCost: number;
  totalMinutes: number;
}

/** High-level overview across all sessions in the period */
export interface StatsOverview {
  sessionCount: number;
  totalCost: number;
  totalTimeMinutes: number;
  messageCount: number;
  totalTokens: number;
  projectCount: number;
  sessionsWithCostCount: number;

  activityByDay: TimeSeriesPoint[];
  todayStats: DayStats;
  yesterdayStats: DayStats;
  weekStats: DayStats;

  topProjects: GroupedMetric[];
  sourceTools: GroupedMetric[];
}

/** Detailed cost breakdown */
export interface CostBreakdown {
  totalCost: number;
  avgPerDay: number;
  avgPerSession: number;
  sessionCount: number;
  sessionsWithCostCount: number;

  dailyTrend: TimeSeriesPoint[];
  peakDay: { date: string; cost: number; sessions: number } | null;

  byProject: GroupedMetric[];
  byModel: GroupedMetric[];

  tokenBreakdown: {
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheReads: number;
    inputCost: number;
    outputCost: number;
    cacheCreationCost: number;
    cacheReadCost: number;
    cacheHitRate: number;
  };
}

/** Per-project stats row */
export interface ProjectStatsEntry {
  projectId: string;
  projectName: string;
  sessionCount: number;
  totalCost: number;
  totalTimeMinutes: number;
  messageCount: number;
  totalTokens: number;
  primaryModel?: string;
  lastActive: Date;
  sourceTool?: string;
  activityByDay: TimeSeriesPoint[];
}

/** A single session within the "today" view */
export interface TodaySession {
  id: string;
  projectName: string;
  title: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  cost?: number;
  model?: string;
  messageCount: number;
  sessionCharacter?: string;
}

/** Aggregated stats for today */
export interface TodayStats {
  date: Date;
  sessionCount: number;
  totalCost: number;
  totalTimeMinutes: number;
  messageCount: number;
  totalTokens: number;
  sessions: TodaySession[];
}

/** Per-model stats row */
export interface ModelStatsEntry {
  model: string;
  displayName: string;
  sessionCount: number;
  sessionPercent: number;
  totalCost: number;
  costPercent: number;
  avgCostPerSession: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  trend: TimeSeriesPoint[];
}

// ──────────────────────────────────────────────────────
// Error classes
// ──────────────────────────────────────────────────────

/** Base error for all stats-related failures */
export class StatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatsError';
  }
}

/** Thrown when a project name cannot be resolved */
export class ProjectNotFoundError extends StatsError {
  public readonly projectName: string;
  public readonly availableProjects: { name: string }[];
  public readonly suggestions: string[];

  constructor(
    message: string,
    projectName: string,
    availableProjects: { name: string }[],
    suggestions: string[],
  ) {
    super(message);
    this.name = 'ProjectNotFoundError';
    this.projectName = projectName;
    this.availableProjects = availableProjects;
    this.suggestions = suggestions;
  }
}

/** Thrown when an invalid period value is provided */
export class InvalidPeriodError extends StatsError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPeriodError';
  }
}
