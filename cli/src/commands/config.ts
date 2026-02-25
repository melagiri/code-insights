import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, isConfigured, resolveDataSourcePreference, isFirebaseConfigured } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import type { DataSourcePreference } from '../types.js';

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

  const effectiveSource = resolveDataSourcePreference();
  const firebaseConfigured = isFirebaseConfigured();

  console.log(chalk.cyan('\n  Code Insights Configuration\n'));

  // Data source
  console.log(chalk.white('  Data Source:'));
  if (config.dataSource) {
    console.log(chalk.gray(`    Configured: ${config.dataSource}`));
  } else {
    console.log(chalk.gray(`    Configured: (not set)`));
  }
  console.log(chalk.gray(`    Effective:  ${effectiveSource}`));

  // Firebase
  console.log(chalk.white('\n  Firebase:'));
  if (firebaseConfigured) {
    console.log(chalk.green(`    Status:  configured`));
    console.log(chalk.gray(`    Project: ${config.firebase!.projectId}`));
  } else {
    console.log(chalk.yellow(`    Status:  not configured`));
  }

  // Sync
  console.log(chalk.white('\n  Sync:'));
  console.log(chalk.gray(`    Claude dir: ${config.sync.claudeDir}`));
  if (config.sync.excludeProjects.length > 0) {
    console.log(chalk.gray(`    Excluded:   ${config.sync.excludeProjects.join(', ')}`));
  }

  // Dashboard
  if (config.dashboardUrl) {
    console.log(chalk.white('\n  Dashboard:'));
    console.log(chalk.gray(`    URL: ${config.dashboardUrl}`));
  }

  // Telemetry — default is enabled; env vars can override at runtime
  console.log(chalk.white('\n  Telemetry:'));
  const telemetryEnabled = config.telemetry !== false;  // default true
  if (process.env.CODE_INSIGHTS_TELEMETRY_DISABLED === '1' || process.env.DO_NOT_TRACK === '1') {
    console.log(chalk.yellow(`    Status:  disabled (via env var)`));
  } else {
    console.log(chalk.gray(`    Status:  ${telemetryEnabled ? 'enabled' : 'disabled'}`));
  }

  console.log('');
  trackEvent('config', true);
}

/**
 * Set the preferred data source ('local' or 'firebase').
 */
function setSourceAction(source: string): void {
  if (source !== 'local' && source !== 'firebase') {
    console.error(chalk.red(`\nInvalid source "${source}". Must be "local" or "firebase".\n`));
    process.exit(1);
  }

  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('\nNot configured. Run `code-insights init` first.\n'));
    process.exit(1);
  }

  if (source === 'firebase' && !isFirebaseConfigured()) {
    console.error(chalk.red('\nFirebase credentials not configured.'));
    console.error(chalk.gray('Run `code-insights init` to add Firebase credentials before setting source to "firebase".\n'));
    process.exit(1);
  }

  config.dataSource = source as DataSourcePreference;
  saveConfig(config);

  console.log(chalk.green(`\nData source preference set to "${source}".\n`));
  trackEvent('config', true, 'set-source');
}

export const configCommand = new Command('config')
  .description('Show or update Code Insights configuration')
  .action(() => {
    showConfigAction();
  });

configCommand
  .command('set-source <source>')
  .description('Set preferred data source (local or firebase)')
  .action((source: string) => {
    setSourceAction(source);
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value (telemetry, source)')
  .action((key: string, value: string) => {
    if (key === 'telemetry') {
      if (value !== 'true' && value !== 'false') {
        console.error(chalk.red(`\nInvalid value "${value}". Must be "true" or "false".\n`));
        process.exit(1);
      }
      const config = loadConfig();
      if (!config) {
        // No existing config — create minimal one so telemetry pref is persisted
        saveConfig({
          sync: { claudeDir: '~/.claude/projects', excludeProjects: [] },
          dataSource: 'local' as DataSourcePreference,
          telemetry: value === 'true',
        });
      } else {
        config.telemetry = value === 'true';
        saveConfig(config);
      }
      console.log(chalk.green(`\nTelemetry ${value === 'true' ? 'enabled' : 'disabled'}.\n`));
      trackEvent('config', true, 'set');
    } else if (key === 'source') {
      setSourceAction(value);
      trackEvent('config', true, 'set');
    } else {
      console.error(chalk.red(`\nUnknown config key "${key}". Available: telemetry, source.\n`));
      process.exit(1);
    }
  });
