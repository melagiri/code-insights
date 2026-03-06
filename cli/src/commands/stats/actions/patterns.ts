// ──────────────────────────────────────────────────────
// stats patterns — View cross-session pattern analysis
// ──────────────────────────────────────────────────────

import chalk from 'chalk';
import ora from 'ora';
import type { StatsFlags } from '../data/types.js';
import { resolveDataSource } from '../data/source.js';
import { handleStatsError } from './error-handler.js';
import { loadConfig } from '../../../utils/config.js';
import { sectionHeader } from '../render/layout.js';

interface AggregatedData {
  frictionCategories: Array<{
    category: string;
    count: number;
    avg_severity: number;
    examples: string[];
  }>;
  effectivePatterns: Array<{
    description: string;
    frequency: number;
    avg_confidence: number;
  }>;
  outcomeDistribution: Record<string, number>;
  workflowDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  totalSessions: number;
  frictionTotal: number;
}

export async function patternsAction(flags: StatsFlags): Promise<void> {
  try {
    const source = await resolveDataSource(flags);

    // Sync first unless --no-sync
    if (!flags.noSync) {
      const spinner = ora({ text: 'Syncing...', indent: 2 }).start();
      try {
        const prepResult = await source.prepare(flags);
        spinner.succeed(prepResult.message);
      } catch {
        spinner.warn('Sync failed (showing cached data)');
      }
    }

    const config = loadConfig();
    const port = config?.dashboard?.port || 7890;
    const baseUrl = `http://localhost:${port}`;

    // Check if server is running
    try {
      await fetch(`${baseUrl}/api/health`);
    } catch {
      console.log();
      console.log(chalk.yellow('  Dashboard server is not running.'));
      console.log(chalk.dim('  Start it with: code-insights dashboard'));
      console.log();
      return;
    }

    // Fetch aggregated data
    const params = new URLSearchParams();
    params.set('period', flags.period);
    if (flags.project) params.set('project', flags.project);
    if (flags.source) params.set('source', flags.source);

    const res = await fetch(`${baseUrl}/api/reflect/results?${params.toString()}`);
    if (!res.ok) {
      console.log(chalk.red(`  Failed to fetch patterns: ${res.statusText}`));
      return;
    }

    const data = await res.json() as AggregatedData;

    if (data.totalSessions === 0) {
      console.log();
      console.log(chalk.dim('  No sessions with facets found.'));
      console.log(chalk.dim('  Run session analysis to extract facets, then try again.'));
      console.log();
      return;
    }

    console.log();
    console.log(sectionHeader(`Patterns (${flags.period}) — ${data.totalSessions} sessions`));
    console.log();

    // Friction categories
    if (data.frictionCategories.length > 0) {
      console.log(chalk.bold('  Friction Categories'));
      const maxCount = Math.max(...data.frictionCategories.map(fc => fc.count));
      for (const fc of data.frictionCategories.slice(0, 10)) {
        const barLen = Math.max(1, Math.round((fc.count / maxCount) * 20));
        const bar = '█'.repeat(barLen);
        const severityColor = fc.avg_severity >= 2.5 ? chalk.red : fc.avg_severity >= 1.5 ? chalk.yellow : chalk.green;
        console.log(`    ${chalk.dim(String(fc.count).padStart(3))} ${severityColor(bar)} ${fc.category}`);
      }
      console.log();
    }

    // Effective patterns
    if (data.effectivePatterns.length > 0) {
      console.log(chalk.bold('  Effective Patterns'));
      for (const ep of data.effectivePatterns.slice(0, 5)) {
        console.log(`    ${chalk.green('✓')} ${ep.description} ${chalk.dim(`(${ep.frequency}x)`)}`);
      }
      console.log();
    }

    // Outcome distribution
    const outcomes = Object.entries(data.outcomeDistribution);
    if (outcomes.length > 0) {
      console.log(chalk.bold('  Outcome Distribution'));
      for (const [outcome, count] of outcomes) {
        const icon = outcome === 'high' ? chalk.green('●') : outcome === 'medium' ? chalk.yellow('●') : outcome === 'low' ? chalk.red('●') : chalk.dim('●');
        console.log(`    ${icon} ${outcome}: ${count}`);
      }
      console.log();
    }

    // Workflow patterns
    const workflows = Object.entries(data.workflowDistribution);
    if (workflows.length > 0) {
      console.log(chalk.bold('  Workflow Patterns'));
      for (const [pattern, count] of workflows) {
        console.log(`    ${chalk.cyan('→')} ${pattern}: ${count}`);
      }
      console.log();
    }

    console.log(chalk.dim('  Generate full analysis: code-insights reflect'));
    console.log(chalk.dim('  View in dashboard: code-insights dashboard → Patterns'));
    console.log();

    // Check for cached reflect snapshot
    const snapshotRes = await fetch(`${baseUrl}/api/reflect/snapshot?${params.toString()}`);
    if (snapshotRes.ok) {
      const snapshotData = await snapshotRes.json() as {
        snapshot: {
          generatedAt: string;
          windowStart: string | null;
          windowEnd: string;
          sessionCount: number;
          results: Record<string, Record<string, unknown>>;
        } | null;
      };

      if (snapshotData.snapshot) {
        const snap = snapshotData.snapshot;
        const genDate = new Date(snap.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const windowLabel = snap.windowStart
          ? `${new Date(snap.windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(snap.windowEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : 'All time';

        console.log(chalk.dim(`  ─── Last reflection (generated ${genDate} · ${windowLabel} · ${snap.sessionCount} sessions) ───`));
        console.log();

        const frictionWins = snap.results['friction-wins'];
        if (frictionWins?.narrative) {
          console.log(chalk.bold('  Friction & Wins'));
          const lines = String(frictionWins.narrative).split('\n').slice(0, 3);
          for (const line of lines) {
            console.log(chalk.dim('  ') + line);
          }
          if (String(frictionWins.narrative).split('\n').length > 3) {
            console.log(chalk.dim('  ...'));
          }
          console.log();
        }

        const stale = data.totalSessions > snap.sessionCount;
        if (stale) {
          console.log(chalk.yellow(`  ${data.totalSessions - snap.sessionCount} new sessions since last reflection.`));
          console.log(chalk.dim('  Run: code-insights reflect'));
          console.log();
        }
      }
    }
  } catch (error) {
    handleStatsError(error);
  }
}
