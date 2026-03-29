/**
 * AnalysisRunner interface — the abstraction between the `insights` command
 * and the actual LLM backend (native claude -p, or configured provider).
 *
 * Adding a new runner (e.g. CursorNativeRunner) requires only implementing
 * this interface — no changes to the `insights` command.
 */

export interface AnalysisRunner {
  readonly name: string;
  runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult>;
}

export interface RunAnalysisParams {
  systemPrompt: string;
  userPrompt: string;
  /** JSON schema file content for structured output (used by native mode via --json-schema). */
  jsonSchema?: object;
}

export interface RunAnalysisResult {
  rawJson: string;
  durationMs: number;
  /**
   * Token counts.
   * Native mode: always 0 — tokens are counted as part of the overall Claude Code session.
   * Provider mode: actual token counts from the LLM API response.
   */
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model: string;
  provider: string;
}
