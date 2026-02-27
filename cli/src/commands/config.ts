import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, isConfigured } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import type { ClaudeInsightConfig } from '../types.js';

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

  // Telemetry — default is enabled; env vars can override at runtime
  console.log(chalk.white('\n  Telemetry:'));
  const telemetryEnabled = config.telemetry !== false;
  if (process.env.CODE_INSIGHTS_TELEMETRY_DISABLED === '1' || process.env.DO_NOT_TRACK === '1') {
    console.log(chalk.yellow('    Status:  disabled (via env var)'));
  } else {
    console.log(chalk.gray(`    Status:  ${telemetryEnabled ? 'enabled' : 'disabled'}`));
  }

  console.log('');
  trackEvent('config', true);
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
      trackEvent('config', true, 'set');
    } else {
      console.error(chalk.red(`\nUnknown config key "${key}". Available: telemetry.\n`));
      process.exit(1);
    }
  });
