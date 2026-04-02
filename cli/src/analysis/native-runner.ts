/**
 * ClaudeNativeRunner — executes analysis via `claude -p` (non-interactive mode).
 *
 * Uses execFileSync (NOT exec) to prevent shell injection: arguments are passed
 * as an array, never interpolated into a shell command string.
 *
 * Token counts are 0 because native-mode tokens are counted as part of the
 * overall Claude Code session — Code Insights incurs no separate cost.
 */

import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AnalysisRunner, RunAnalysisParams, RunAnalysisResult } from './runner-types.js';

// `claude -p --output-format json` returns a JSON array of typed event objects.
// We care only about the final result event.
interface ClaudeEvent {
  type: string;
  subtype?: string;
}

interface ClaudeResultEvent extends ClaudeEvent {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  result: string;
  is_error: boolean;
}

function isResultEvent(e: ClaudeEvent): e is ClaudeResultEvent {
  return e.type === 'result';
}

/**
 * Extract the LLM text payload from a `claude -p --output-format json` response.
 * The output is an array of event objects; the actual content lives in the
 * `result` event's `result` field.
 */
function extractResultFromEnvelope(rawOutput: string): string {
  let events: ClaudeEvent[];
  try {
    events = JSON.parse(rawOutput) as ClaudeEvent[];
  } catch {
    throw new Error(
      `claude -p returned non-JSON output. Output preview: ${rawOutput.slice(0, 200)}`
    );
  }

  if (!Array.isArray(events)) {
    throw new Error('claude -p output was JSON but not an array of events as expected.');
  }

  const resultEvent = events.find(isResultEvent);
  if (!resultEvent) {
    throw new Error('claude -p output contained no result event. Events: ' + JSON.stringify(events.map(e => e.type)));
  }

  if (resultEvent.is_error) {
    throw new Error(`claude -p reported an error: ${resultEvent.result}`);
  }

  return resultEvent.result;
}

/** Default model used by ClaudeNativeRunner when --model is not specified. */
export const DEFAULT_NATIVE_MODEL = 'sonnet';

export class ClaudeNativeRunner implements AnalysisRunner {
  readonly name = 'claude-code-native';
  private readonly model: string;

  constructor(options?: { model?: string }) {
    this.model = options?.model ?? DEFAULT_NATIVE_MODEL;
  }

  /**
   * Validate that the `claude` CLI is available in PATH.
   * Call this once before running analysis to give the user a clear error
   * instead of a cryptic ENOENT from execFileSync.
   */
  static validate(): void {
    try {
      execFileSync('claude', ['--version'], { stdio: 'pipe' });
    } catch {
      throw new Error(
        'claude CLI not found in PATH. --native requires Claude Code to be installed.\n' +
        'Install it from: https://claude.ai/download'
      );
    }
  }

  async runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const start = Date.now();
    // Include a random suffix to avoid collisions if two analyses run concurrently.
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Write system prompt to a temp file — claude -p reads it via --append-system-prompt-file.
    // Temp file avoids command-line length limits and shell escaping issues.
    const promptFile = join(tmpdir(), `ci-prompt-${fileId}.txt`);
    writeFileSync(promptFile, params.systemPrompt, 'utf-8');

    let schemaFile: string | undefined;
    if (params.jsonSchema) {
      schemaFile = join(tmpdir(), `ci-schema-${fileId}.json`);
      writeFileSync(schemaFile, JSON.stringify(params.jsonSchema), 'utf-8');
    }

    try {
      const args = [
        '-p',
        '--model', this.model,
        '--output-format', 'json',
        '--append-system-prompt-file', promptFile,
      ];
      if (schemaFile) {
        args.push('--json-schema', schemaFile);
      }

      const rawOutput = execFileSync('claude', args, {
        input: params.userPrompt,
        encoding: 'utf-8',
        timeout: 300_000,    // 5-minute hard limit per analysis call
        maxBuffer: 10 * 1024 * 1024,  // 10 MB
        cwd: tmpdir(),       // Isolate claude -p session files from user's project
        // Propagate CODE_INSIGHTS_HOOK_ACTIVE so the claude -p subprocess won't
        // trigger another SessionEnd hook when its own session ends (breaks the loop).
        env: { ...process.env, CODE_INSIGHTS_HOOK_ACTIVE: '1' },
      });

      // claude -p --output-format json wraps the response in an event array.
      // Extract the actual LLM text from the result event.
      const rawJson = extractResultFromEnvelope(rawOutput);

      return {
        rawJson,
        durationMs: Date.now() - start,
        inputTokens: 0,
        outputTokens: 0,
        model: this.model,
        provider: 'claude-code-native',
      };
    } finally {
      // Always clean up temp files, even if execFileSync throws.
      try { unlinkSync(promptFile); } catch { /* ignore — file may not exist */ }
      if (schemaFile) {
        try { unlinkSync(schemaFile); } catch { /* ignore */ }
      }
    }
  }
}
