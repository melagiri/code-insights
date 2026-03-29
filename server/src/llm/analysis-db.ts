// Re-exports from @code-insights/cli — analysis DB logic lives in the CLI package
// so the CLI can use it directly without a cross-package import.
// Server consumers import from here as before; the path is unchanged.
export {
  saveInsightsToDb,
  deleteSessionInsights,
  saveFacetsToDb,
  convertToInsightRows,
  convertPQToInsightRow,
  // Backward-compat alias — server code used the longer name from the original server module.
  convertPQToInsightRow as convertPromptQualityToInsightRow,
  ANALYSIS_VERSION,
} from '@code-insights/cli/analysis/analysis-db';
export type {
  InsightRow,
  SessionData,
  DeleteOptions,
} from '@code-insights/cli/analysis/analysis-db';
