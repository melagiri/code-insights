import { loadConfig } from '../../../utils/config.js';
import { getDb } from '../../../db/client.js';
import type { Check, CheckResult } from '../types.js';

export function analysisChecks(): Check[] {
  return [
    {
      id: 'analysis.configured',
      label: 'LLM provider',
      run: async (): Promise<CheckResult> => {
        const config = loadConfig();
        const llm = config?.dashboard?.llm;
        if (llm?.provider && llm?.model) {
          return {
            id: 'analysis.configured',
            label: 'LLM provider',
            status: 'pass',
            detail: `${llm.provider} / ${llm.model}`,
          };
        }
        return {
          id: 'analysis.configured',
          label: 'LLM provider',
          status: 'optional',
          detail: 'Not configured',
          verboseLines: [
            '',
            'LLM analysis surfaces patterns, prompt quality, and decisions across sessions.',
            'Free options (no API key):',
            '  ollama  -> brew install ollama && ollama pull llama3.3',
            '            code-insights config set-provider ollama llama3.3',
            'Paid:',
            '  code-insights config set-provider anthropic claude-sonnet-4-20250514',
          ],
        };
      },
    },
    {
      id: 'analysis.reachable',
      label: 'LLM reachable',
      run: async (): Promise<CheckResult> => {
        const config = loadConfig();
        const llm = config?.dashboard?.llm;
        if (!llm?.provider) {
          return { id: 'analysis.reachable', label: 'LLM reachable', status: 'skip', detail: 'No provider configured' };
        }

        // For Ollama, check if the server is running
        if (llm.provider === 'ollama') {
          try {
            const baseUrl = (llm.baseUrl || 'http://localhost:11434').trim().replace(/\/$/, '');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
              return { id: 'analysis.reachable', label: 'LLM reachable', status: 'pass', detail: 'Ollama responding' };
            }
            return { id: 'analysis.reachable', label: 'LLM reachable', status: 'warn', detail: `Ollama returned ${res.status}` };
          } catch {
            return {
              id: 'analysis.reachable',
              label: 'LLM reachable',
              status: 'warn',
              detail: 'Ollama not responding',
              hint: 'Run: ollama serve',
            };
          }
        }

        // For llama.cpp, check the health endpoint
        if (llm.provider === 'llamacpp') {
          try {
            const baseUrl = (llm.baseUrl || 'http://localhost:8080').trim().replace(/\/$/, '');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
              return { id: 'analysis.reachable', label: 'LLM reachable', status: 'pass', detail: 'llama.cpp responding' };
            }
            return { id: 'analysis.reachable', label: 'LLM reachable', status: 'warn', detail: `llama.cpp returned ${res.status}` };
          } catch {
            return {
              id: 'analysis.reachable',
              label: 'LLM reachable',
              status: 'warn',
              detail: 'llama.cpp server not responding',
              hint: 'Start your llama.cpp server',
            };
          }
        }

        // For cloud providers, skip reachability (would need API key validation)
        return { id: 'analysis.reachable', label: 'LLM reachable', status: 'skip', detail: `${llm.provider} (cloud — skipped)` };
      },
    },
    {
      id: 'analysis.queue_failed',
      label: 'Failed queue items',
      run: async (): Promise<CheckResult> => {
        try {
          const db = getDb();
          const row = db.prepare(
            `SELECT COUNT(*) as cnt, MAX(error_message) as last_error FROM analysis_queue WHERE status = 'failed'`
          ).get() as { cnt: number; last_error: string | null };
          if (row.cnt === 0) {
            return { id: 'analysis.queue_failed', label: 'Failed queue items', status: 'pass' };
          }
          return {
            id: 'analysis.queue_failed',
            label: 'Failed queue items',
            status: 'warn',
            detail: `${row.cnt} failed — last error: ${row.last_error ?? 'unknown'}`,
            hint: 'Run: code-insights queue retry',
          };
        } catch {
          return { id: 'analysis.queue_failed', label: 'Failed queue items', status: 'skip' };
        }
      },
    },
    {
      id: 'analysis.queue_stuck',
      label: 'Stuck queue items',
      run: async (): Promise<CheckResult> => {
        try {
          const db = getDb();
          const row = db.prepare(
            `SELECT COUNT(*) as cnt FROM analysis_queue WHERE status = 'processing' AND started_at < datetime('now', '-10 minutes')`
          ).get() as { cnt: number };
          if (row.cnt === 0) {
            return { id: 'analysis.queue_stuck', label: 'Stuck queue items', status: 'pass' };
          }
          return {
            id: 'analysis.queue_stuck',
            label: 'Stuck queue items',
            status: 'warn',
            detail: `${row.cnt} item(s) stuck in processing > 10 minutes`,
            hint: 'Run: code-insights doctor --fix (will reset stale items)',
            fix: async () => {
              const { resetStale } = await import('../../../db/queue.js');
              resetStale();
            },
            fixLabel: 'Reset stale queue items',
          };
        } catch {
          return { id: 'analysis.queue_stuck', label: 'Stuck queue items', status: 'skip' };
        }
      },
    },
  ];
}
