import type { StatsDataSource, StatsFlags } from './types.js';

/**
 * Resolve the data source for stats commands.
 * Phase 2: always local SQLite — Firebase is removed.
 */
export async function resolveDataSource(_flags: StatsFlags): Promise<StatsDataSource> {
  const { LocalDataSource } = await import('./local.js');
  return new LocalDataSource();
}
