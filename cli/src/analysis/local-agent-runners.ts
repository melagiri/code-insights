/** Local coding-agent runners for subscription-backed analysis. */

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AnalysisRunner, RunAnalysisParams, RunAnalysisResult } from './runner-types.js';

export type LocalRunnerName = 'claude' | 'codex' | 'opencode';

interface OpenCodeEvent {
  type?: string;
  part?: { text?: string };
  text?: string;
  error?: { message?: string } | string;
}

export function extractOpenCodeResult(rawOutput: string): string {
  const textParts: string[] = [];
  for (const line of rawOutput.split(/\r?\n/).filter(Boolean)) {
    let event: OpenCodeEvent;
    try {
      event = JSON.parse(line) as OpenCodeEvent;
    } catch {
      continue;
    }
    if (event.type === 'error') {
      const message = typeof event.error === 'string' ? event.error : event.error?.message;
      throw new Error(`opencode reported an error${message ? `: ${message}` : ''}`);
    }
    if (event.type === 'text') {
      const text = event.part?.text ?? event.text;
      if (text) textParts.push(text);
    }
  }
  if (textParts.length === 0) {
    throw new Error(`opencode returned no text event. Output preview: ${rawOutput.slice(0, 200)}`);
  }
  return textParts.join('');
}

abstract class LocalAgentRunner implements AnalysisRunner {
  abstract readonly name: string;
  abstract runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult>;
  protected readonly model?: string;

  constructor(options?: { model?: string }) {
    this.model = options?.model;
  }

  protected result(rawJson: string, start: number, model: string): RunAnalysisResult {
    return {
      rawJson,
      durationMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      model,
      provider: this.name,
    };
  }
}

export class CodexNativeRunner extends LocalAgentRunner {
  readonly name = 'codex-native';

  static validate(): void {
    try {
      execFileSync('codex', ['--version'], { stdio: 'pipe' });
    } catch {
      throw new Error('codex CLI not found in PATH. Install Codex CLI and sign in before using --runner codex.');
    }
  }

  async runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const start = Date.now();
    const dir = mkdtempSync(join(tmpdir(), 'code-insights-codex-'));
    const outputFile = join(dir, 'result.txt');
    const schemaFile = join(dir, 'schema.json');
    try {
      const args = [
        'exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--ignore-user-config',
        '--ignore-rules', '--color', 'never', '--output-last-message', outputFile,
      ];
      if (this.model) args.push('--model', this.model);
      if (params.jsonSchema) {
        writeFileSync(schemaFile, JSON.stringify(params.jsonSchema), 'utf-8');
        args.push('--output-schema', schemaFile);
      }
      args.push('-');
      execFileSync('codex', args, {
        input: `${params.systemPrompt}\n\n${params.userPrompt}`,
        encoding: 'utf-8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024, cwd: dir,
        env: { ...process.env, CODE_INSIGHTS_HOOK_ACTIVE: '1' },
      });
      return this.result(readFileSync(outputFile, 'utf-8'), start, this.model ?? 'default');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

export class OpenCodeNativeRunner extends LocalAgentRunner {
  readonly name = 'opencode-native';

  static validate(): void {
    try {
      execFileSync('opencode', ['--version'], { stdio: 'pipe' });
    } catch {
      throw new Error('opencode CLI not found in PATH. Install OpenCode and connect a provider before using --runner opencode.');
    }
  }

  async runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const start = Date.now();
    const dir = mkdtempSync(join(tmpdir(), 'code-insights-opencode-'));
    try {
      const args = ['run', '--format', 'json', '--pure', '--dir', dir];
      if (this.model) args.push('--model', this.model);
      const schemaInstruction = params.jsonSchema
        ? `\n\nReturn only JSON matching this schema:\n${JSON.stringify(params.jsonSchema)}`
        : '';
      const rawOutput = execFileSync('opencode', args, {
        input: `${params.systemPrompt}\n\n${params.userPrompt}${schemaInstruction}`,
        encoding: 'utf-8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024, cwd: dir,
        env: {
          ...process.env,
          CODE_INSIGHTS_HOOK_ACTIVE: '1',
          OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { '*': 'deny' } }),
        },
      });
      return this.result(extractOpenCodeResult(rawOutput), start, this.model ?? 'default');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
