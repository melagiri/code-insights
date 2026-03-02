import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, isConfigured } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import { PROVIDERS, getDefaultModel } from '../constants/llm-providers.js';
import type { ClaudeInsightConfig, LLMProviderConfig } from '../types.js';

/**
 * Show current configuration summary.
 */
function showConfigAction(): void {
  if (!isConfigured()) {
    console.log(chalk.yellow('\nNot configured. Run `code-insights init` to set up.\n'));
    return;
  }

  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\nFailed to load config.\n'));
    return;
  }

  console.log(chalk.cyan('\n  Code Insights Configuration\n'));

  // Sync
  console.log(chalk.white('  Sync:'));
  console.log(chalk.gray(`    Claude dir: ${config.sync.claudeDir}`));
  if (config.sync.excludeProjects.length > 0) {
    console.log(chalk.gray(`    Excluded:   ${config.sync.excludeProjects.join(', ')}`));
  }

  // Dashboard (Phase 3)
  if (config.dashboard?.port) {
    console.log(chalk.white('\n  Dashboard:'));
    console.log(chalk.gray(`    Port: ${config.dashboard.port}`));
  }

  // LLM config
  if (config.dashboard?.llm) {
    const llm = config.dashboard.llm;
    const maskedKey = llm.apiKey && llm.apiKey.length >= 8
      ? llm.apiKey.slice(0, 4) + '...' + llm.apiKey.slice(-4)
      : llm.apiKey ? '***' : '(none)';

    console.log(chalk.white('\n  LLM:'));
    console.log(chalk.gray(`    Provider: ${llm.provider}`));
    console.log(chalk.gray(`    Model:    ${llm.model}`));
    if (llm.provider !== 'ollama') {
      console.log(chalk.gray(`    API Key:  ${maskedKey}`));
    }
    if (llm.baseUrl) {
      console.log(chalk.gray(`    Base URL: ${llm.baseUrl}`));
    }
  }

  // Telemetry — default is enabled; env vars can override at runtime
  console.log(chalk.white('\n  Telemetry:'));
  const telemetryEnabled = config.telemetry !== false;
  if (process.env.CODE_INSIGHTS_TELEMETRY_DISABLED === '1' || process.env.DO_NOT_TRACK === '1') {
    console.log(chalk.yellow('    Status:  disabled (via env var)'));
  } else {
    console.log(chalk.gray(`    Status:  ${telemetryEnabled ? 'enabled' : 'disabled'}`));
  }

  console.log('');
  trackEvent('cli_config', { subcommand: 'view', success: true });
}

export const configCommand = new Command('config')
  .description('Show Code Insights configuration')
  .action(() => {
    showConfigAction();
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value (telemetry)')
  .action((key: string, value: string) => {
    if (key === 'telemetry') {
      if (value !== 'true' && value !== 'false') {
        console.error(chalk.red(`\nInvalid value "${value}". Must be "true" or "false".\n`));
        process.exit(1);
      }
      const existing = loadConfig();
      if (!existing) {
        saveConfig({
          sync: { claudeDir: '~/.claude/projects', excludeProjects: [] },
          telemetry: value === 'true',
        });
      } else {
        existing.telemetry = value === 'true';
        saveConfig(existing);
      }
      console.log(chalk.green(`\nTelemetry ${value === 'true' ? 'enabled' : 'disabled'}.\n`));
      trackEvent('cli_config', { subcommand: 'set', success: true });
    } else {
      console.error(chalk.red(`\nUnknown config key "${key}". Available: telemetry.\n`));
      process.exit(1);
    }
  });

// ── config llm ────────────────────────────────────────────────────────────────

const llmCommand = configCommand
  .command('llm')
  .description('Configure LLM provider for AI-powered session analysis')
  .option('--provider <provider>', 'LLM provider (openai, anthropic, gemini, ollama)')
  .option('--model <model>', 'Model ID (e.g., gpt-4o, claude-sonnet-4-20250514)')
  .option('--api-key <key>', 'API key for the selected provider')
  .option('--base-url <url>', 'Custom base URL (for Ollama or local endpoints)')
  .option('--show', 'Show current LLM configuration')
  .action(async (options: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    show?: boolean;
  }) => {
    // --show: display current LLM config and exit
    if (options.show) {
      const config = loadConfig();
      const llm = config?.dashboard?.llm;

      if (!llm) {
        console.log(chalk.yellow('\nLLM not configured. Run `code-insights config llm` to set up.\n'));
        return;
      }

      const maskedKey = llm.apiKey && llm.apiKey.length >= 8
        ? llm.apiKey.slice(0, 4) + '...' + llm.apiKey.slice(-4)
        : llm.apiKey ? '***' : '(none)';

      console.log(chalk.cyan('\n  LLM Configuration\n'));
      console.log(chalk.gray(`    Provider: ${llm.provider}`));
      console.log(chalk.gray(`    Model:    ${llm.model}`));
      if (llm.provider !== 'ollama') {
        console.log(chalk.gray(`    API Key:  ${maskedKey}`));
      }
      if (llm.baseUrl) {
        console.log(chalk.gray(`    Base URL: ${llm.baseUrl}`));
      }
      console.log('');
      return;
    }

    // Non-interactive: all required fields provided via flags
    if (options.provider && options.model) {
      const validProviders = PROVIDERS.map(p => p.id);
      if (!validProviders.includes(options.provider as LLMProviderConfig['provider'])) {
        console.error(chalk.red(`\nInvalid provider "${options.provider}". Must be one of: ${validProviders.join(', ')}\n`));
        process.exit(1);
      }

      const providerInfo = PROVIDERS.find(p => p.id === options.provider);
      if (providerInfo?.requiresApiKey && !options.apiKey) {
        console.error(chalk.red(`\nProvider "${options.provider}" requires an API key. Use --api-key <key>\n`));
        process.exit(1);
      }

      const llmConfig: LLMProviderConfig = {
        provider: options.provider as LLMProviderConfig['provider'],
        model: options.model,
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      };

      saveLLMConfig(llmConfig);
      console.log(chalk.green(`\nLLM configured: ${options.provider} / ${options.model}\n`));
      return;
    }

    // Interactive flow
    await runInteractiveLLMConfig();
  });

/**
 * Interactive LLM configuration wizard.
 */
async function runInteractiveLLMConfig(): Promise<void> {
  const existing = loadConfig()?.dashboard?.llm;

  console.log(chalk.cyan('\n  LLM Configuration\n'));
  console.log(chalk.gray('  Configure the AI provider used for session analysis.\n'));

  // Step 1: Select provider
  const { provider } = await inquirer.prompt<{ provider: LLMProviderConfig['provider'] }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Select LLM provider:',
      choices: PROVIDERS.map(p => ({
        name: `${p.name}${p.requiresApiKey ? '' : ' (no API key needed)'}`,
        value: p.id,
      })),
      default: existing?.provider ?? 'ollama',
    },
  ]);

  const providerInfo = PROVIDERS.find(p => p.id === provider);
  if (!providerInfo) {
    console.error(chalk.red('\nFailed to find provider info. Aborting.\n'));
    process.exit(1);
  }

  // Step 2: Select model
  const { model } = await inquirer.prompt<{ model: string }>([
    {
      type: 'list',
      name: 'model',
      message: 'Select model:',
      choices: providerInfo.models.map(m => ({
        name: `${m.name}${m.description ? ` — ${m.description}` : ''}`,
        value: m.id,
      })),
      default: existing?.model ?? getDefaultModel(provider),
    },
  ]);

  const llmConfig: LLMProviderConfig = { provider, model };

  // Step 3: API key (if required)
  if (providerInfo.requiresApiKey) {
    const maskedExisting = existing?.apiKey && existing.apiKey.length >= 8
      ? `${existing.apiKey.slice(0, 4)}...${existing.apiKey.slice(-4)}`
      : undefined;

    const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
      {
        type: 'password',
        name: 'apiKey',
        message: `API key${maskedExisting ? ` (current: ${maskedExisting}, leave blank to keep)` : ''}:`,
        mask: '*',
        validate: (val: string) => {
          if (!val && !existing?.apiKey) {
            return `API key required for ${providerInfo.name}`;
          }
          return true;
        },
      },
    ]);

    // Preserve existing key if blank input
    if (apiKey) {
      llmConfig.apiKey = apiKey;
    } else if (existing?.apiKey) {
      llmConfig.apiKey = existing.apiKey;
    }
  }

  // Step 4: Base URL (Ollama or custom)
  if (provider === 'ollama') {
    const { baseUrl } = await inquirer.prompt<{ baseUrl: string }>([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Ollama URL (leave blank for default http://localhost:11434):',
        default: existing?.baseUrl ?? '',
      },
    ]);

    if (baseUrl && baseUrl !== 'http://localhost:11434') {
      llmConfig.baseUrl = baseUrl;
    }
  }

  saveLLMConfig(llmConfig);

  console.log(chalk.green(`\nLLM configured: ${providerInfo.name} / ${model}\n`));

  if (providerInfo.apiKeyLink && !llmConfig.apiKey) {
    console.log(chalk.dim(`  Get an API key: ${providerInfo.apiKeyLink}\n`));
  }
}

/**
 * Save LLM config into the dashboard.llm field of the CLI config file.
 */
function saveLLMConfig(llmConfig: LLMProviderConfig): void {
  const existing: ClaudeInsightConfig = loadConfig() ?? {
    sync: { claudeDir: '~/.claude/projects', excludeProjects: [] },
  };
  existing.dashboard = { ...existing.dashboard, llm: llmConfig };
  saveConfig(existing);
}

// Suppress unused variable warning — llmCommand is registered via .command() side-effect
void llmCommand;
