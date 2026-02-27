import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../utils/config.js';
import { isTelemetryEnabled, buildEventPreview } from '../utils/telemetry.js';
import type { ClaudeInsightConfig } from '../types.js';

/**
 * Minimal config shape used when no config file exists yet but the user
 * explicitly opts in/out of telemetry before running `init`.
 */
const MINIMAL_CONFIG: ClaudeInsightConfig = {
  sync: { claudeDir: '~/.claude/projects', excludeProjects: [] },
};

/**
 * Show telemetry status and a full field-level explanation of what is collected.
 * Also renders a live event preview when telemetry is enabled so users can see
 * exactly what would be sent — no guessing required.
 */
function statusAction(): void {
  const enabled = isTelemetryEnabled();

  console.log(chalk.cyan('\n  Telemetry\n'));
  console.log(chalk.white(`  Status: ${enabled ? chalk.green('ENABLED') : chalk.yellow('DISABLED')}`));

  // Surface environment-variable overrides so users know why the config value
  // might appear to have no effect.
  if (process.env.CODE_INSIGHTS_TELEMETRY_DISABLED === '1') {
    console.log(chalk.gray('  (Disabled via CODE_INSIGHTS_TELEMETRY_DISABLED env var)'));
  }
  if (process.env.DO_NOT_TRACK === '1') {
    console.log(chalk.gray('  (Disabled via DO_NOT_TRACK env var)'));
  }

  console.log(chalk.white('\n  What we collect (and nothing else):'));

  const preview = buildEventPreview('telemetry');
  const fields: [string, string][] = [
    ['command', 'The command you ran (e.g., "sync", "stats")'],
    ['subcommand', 'Subcommand if any (e.g., "cost", "today")'],
    ['success', 'Whether it succeeded'],
    ['cliVersion', preview.cliVersion],
    ['nodeVersion', preview.nodeVersion],
    ['os', `${preview.os} (${preview.arch})`],
    ['providers', `[${preview.providers.join(', ')}]`],
    ['sessionBucket', preview.sessionCountBucket],
    ['dataSource', preview.dataSource],
    ['hasHook', String(preview.hasHook)],
  ];

  for (const [key, value] of fields) {
    console.log(chalk.gray(`    ${key.padEnd(16)} ${value}`));
  }

  console.log(chalk.white('\n  What we NEVER collect:'));
  console.log(chalk.gray('    File paths, project names, session content, API keys,'));
  console.log(chalk.gray('    git URLs, hostnames, or anything personally identifiable.'));

  // Only show the live event preview when telemetry is on — if it's off there
  // is nothing to preview and showing it could be confusing.
  if (enabled) {
    console.log(chalk.white('\n  Event preview (what would be sent now):'));
    console.log(chalk.gray(`    ${JSON.stringify(preview, null, 2).split('\n').join('\n    ')}`));
  }

  console.log(chalk.white('\n  To change:'));
  console.log(chalk.gray('    code-insights telemetry disable'));
  console.log(chalk.gray('    code-insights telemetry enable'));
  console.log(chalk.gray('    Or set env: CODE_INSIGHTS_TELEMETRY_DISABLED=1\n'));
}

/**
 * Persist telemetry = false to config.
 * If no config file exists yet we write a minimal one — the user clearly has
 * an intent to opt out and we should honour it without forcing them to run init
 * first.
 */
function disableAction(): void {
  const config = loadConfig() ?? { ...MINIMAL_CONFIG };
  config.telemetry = false;
  saveConfig(config);
  console.log(chalk.green('\n  Telemetry disabled.\n'));
}

/**
 * Persist telemetry = true to config.
 * Same minimal-config fallback as disableAction.
 */
function enableAction(): void {
  const config = loadConfig() ?? { ...MINIMAL_CONFIG };
  config.telemetry = true;
  saveConfig(config);
  console.log(chalk.green('\n  Telemetry enabled.\n'));
}

export const telemetryCommand = new Command('telemetry')
  .description('View or manage anonymous usage telemetry')
  .action(() => {
    statusAction();
  });

telemetryCommand
  .command('status')
  .description('Show telemetry state and what data is collected')
  .action(() => {
    statusAction();
  });

telemetryCommand
  .command('disable')
  .description('Disable anonymous telemetry')
  .action(() => {
    disableAction();
  });

telemetryCommand
  .command('enable')
  .description('Enable anonymous telemetry')
  .action(() => {
    enableAction();
  });
