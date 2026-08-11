import type { AnalysisRunner } from './runner-types.js';
import { ClaudeNativeRunner } from './native-runner.js';
import { CodexNativeRunner, OpenCodeNativeRunner, type LocalRunnerName } from './local-agent-runners.js';
import { ProviderRunner } from './provider-runner.js';

export type RunnerName = 'api' | LocalRunnerName;

export function normalizeRunner(runner?: string, native = false): RunnerName {
  if (!runner) return native ? 'claude' : 'api';
  if (runner === 'native') return 'claude';
  if (runner === 'api' || runner === 'claude' || runner === 'codex' || runner === 'opencode') return runner;
  throw new Error(`Unknown analysis runner '${runner}'. Use one of: api, claude, codex, opencode.`);
}

export function createAnalysisRunner(runner: RunnerName, model?: string): AnalysisRunner {
  switch (runner) {
    case 'api': return ProviderRunner.fromConfig();
    case 'claude':
      ClaudeNativeRunner.validate();
      return new ClaudeNativeRunner({ model });
    case 'codex':
      CodexNativeRunner.validate();
      return new CodexNativeRunner({ model });
    case 'opencode':
      OpenCodeNativeRunner.validate();
      return new OpenCodeNativeRunner({ model });
  }
}
