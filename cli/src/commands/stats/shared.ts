import { Command } from 'commander';
import type { Period, StatsFlags } from './data/types.js';
import { InvalidPeriodError } from './data/types.js';

const VALID_PERIODS = ['7d', '30d', '90d', 'all'];

export type { StatsFlags };

export function applySharedFlags(cmd: Command): Command {
  return cmd
    .option('-p, --period <period>', 'Time range: 7d, 30d, 90d, all', '7d')
    .option('--project <name>', 'Scope to a single project')
    .option('--source <tool>', 'Filter by source tool (claude-code, cursor, etc.)')
    .option('--no-sync', 'Skip auto-sync before displaying stats')
    .option('--local', 'Use local session files (no Firebase required)')
    .option('--remote', 'Force Firestore data source (requires Firebase config)');
}

export function parseFlags(options: Record<string, unknown>): StatsFlags {
  const period = (options.period as string) || '7d';
  if (!VALID_PERIODS.includes(period)) {
    throw new InvalidPeriodError(`Invalid period "${period}". Expected: ${VALID_PERIODS.join(', ')}`);
  }
  return {
    period: period as Period,
    project: options.project as string | undefined,
    source: options.source as string | undefined,
    noSync: !options.sync,  // Commander's --no-sync sets sync=false
    local: !!options.local,
    remote: !!options.remote,
  };
}
