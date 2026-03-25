/**
 * Ollama auto-detection for CLI commands.
 *
 * Probes localhost:11434 to check if Ollama is running and has models installed.
 * If found and no LLM is configured, auto-configures the best available model
 * and persists it to config so subsequent syncs skip the probe.
 *
 * Preferred model order matches the canonical list in cli/src/constants/llm-providers.ts.
 */

import chalk from 'chalk';
import { loadConfig, saveConfig, ensureConfigDir } from './config.js';
import type { ClaudeInsightConfig } from '../types.js';

const OLLAMA_URL = 'http://localhost:11434';

// Preferred model order — keep in sync with cli/src/constants/llm-providers.ts Ollama models
const PREFERRED_MODELS = ['llama3.3', 'qwen3:14b', 'mistral', 'qwen2.5-coder'];

/**
 * Query Ollama for installed models. Returns empty array if not running.
 */
async function queryOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ name: string }> };
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

/**
 * Pick the best model from installed ones.
 * Prefers models in PREFERRED_MODELS order, then falls back to first installed.
 */
function pickBestModel(installedModels: string[]): string | null {
  if (installedModels.length === 0) return null;

  // Strip tag suffix for comparison (e.g. "llama3.3:latest" -> "llama3.3")
  for (const preferred of PREFERRED_MODELS) {
    const match = installedModels.find(m => m === preferred || m.startsWith(`${preferred}:`));
    if (match) return preferred; // Return the canonical name (without tag) for clean config
  }

  // No preferred model found — use the first installed one as-is
  return installedModels[0];
}

/**
 * Auto-detect Ollama and configure it if no LLM is currently configured.
 * Prints a friendly message if Ollama is found and auto-configured.
 * Silent if Ollama is not running or a provider is already configured.
 */
export async function autoDetectOllama(): Promise<void> {
  // Check if LLM is already configured — skip probe if so
  const config = loadConfig();
  if (config?.dashboard?.llm) return;

  const installedModels = await queryOllamaModels();
  if (installedModels.length === 0) return;

  const model = pickBestModel(installedModels);
  if (!model) return;

  // Build updated config, preserving existing sync/telemetry settings
  const baseConfig: ClaudeInsightConfig = config ?? {
    sync: { claudeDir: '', excludeProjects: [] },
  };

  const updatedConfig: ClaudeInsightConfig = {
    ...baseConfig,
    dashboard: {
      ...baseConfig.dashboard,
      llm: {
        provider: 'ollama',
        model,
      },
    },
  };

  ensureConfigDir();
  saveConfig(updatedConfig);

  console.log(
    chalk.green(`\n  Ollama detected — using ${chalk.bold(model)} for AI analysis (free & local).`) +
    chalk.dim('\n  Run `code-insights config llm` to change.\n'),
  );
}
