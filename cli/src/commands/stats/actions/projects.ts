// ──────────────────────────────────────────────────────
// stats projects — Per-project detail cards
// ──────────────────────────────────────────────────────

import ora from 'ora';
import { trackEvent, identifyUser } from '../../../utils/telemetry.js';
import { resolveDataSource } from '../data/source.js';
import {
  periodStartDate,
  computeProjectStats,
  shortenModelName,
} from '../data/aggregation.js';
import type { StatsFlags, SessionQueryOptions } from '../data/types.js';
import { colors } from '../render/colors.js';
import { handleStatsError } from './error-handler.js';
import {
  formatMoney,
  formatTokens,
  formatDuration,
  formatRelativeDate,
  formatCount,
  formatPeriodLabel,
} from '../render/format.js';
import { sparkline } from '../render/charts.js';
import { sectionHeader, metricGrid, projectCardHeader } from '../render/layout.js';
import { showTip } from '../../../utils/tips.js';

export async function projectsAction(flags: StatsFlags): Promise<void> {
  const startTime = Date.now();
  try {
    const source = await resolveDataSource(flags);

    const spinner = ora({ text: 'Syncing...', indent: 2 }).start();
    try {
      const prepResult = await source.prepare(flags);
      spinner.succeed(prepResult.message);
    } catch {
      spinner.warn('Sync failed (showing cached data)');
    }

    // Identify user now that DB is open (updates total_sessions person property)
    void identifyUser();

    // Resolve project filter
    const opts: SessionQueryOptions = {
      periodStart: periodStartDate(flags.period),
      sourceTool: flags.source,
    };
    if (flags.project) {
      const resolved = await source.resolveProjectId(flags.project);
      opts.projectId = resolved.projectId;
    }

    const sessions = await source.getSessions(opts);
    const periodLabel = formatPeriodLabel(flags.period);

    // Empty state
    if (sessions.length === 0) {
      console.log(sectionHeader('PROJECTS', periodLabel));
      console.log(`\n  No sessions found in the ${periodLabel.toLowerCase()}.\n`);
      console.log(colors.hint('Run stats --period 30d to expand the time range'));
      console.log();
      return;
    }

    const projects = computeProjectStats(sessions, flags.period);

    // Header
    console.log(sectionHeader('PROJECTS', periodLabel));

    // Summary line
    const totalCost = projects.reduce((sum, p) => sum + p.totalCost, 0);
    console.log(`\n  ${colors.value(String(projects.length))} projects, ${colors.value(formatCount(sessions.length))} sessions, ${colors.money(totalCost)} total`);

    // Project cards
    for (const project of projects) {
      console.log(projectCardHeader(project.projectName));

      const modelDisplay = project.primaryModel
        ? shortenModelName(project.primaryModel)
        : '\u2014';
      const sourceDisplay = project.sourceTool ?? '\u2014';

      console.log(metricGrid([
        { label: 'Sessions', value: formatCount(project.sessionCount) },
        { label: 'Cost', value: formatMoney(project.totalCost) },
        { label: 'Time', value: formatDuration(project.totalTimeMinutes) },
        { label: 'Messages', value: formatCount(project.messageCount) },
        { label: 'Tokens', value: formatTokens(project.totalTokens) },
        { label: 'Model', value: modelDisplay },
      ]));

      // Last active + source on same line
      console.log(`  ${colors.label('Last active')}  ${colors.value(formatRelativeDate(project.lastActive))}${''.padEnd(16)}${colors.label('Source')}  ${colors.source(sourceDisplay)}`);

      // Activity sparkline
      const spark = sparkline(project.activityByDay.map(d => d.value));
      if (spark) {
        console.log(`  ${colors.label('Activity')}  ${spark}`);
      }
    }

    // Hints
    console.log();
    if (!flags.project && projects.length > 0) {
      console.log(colors.hint(`Run stats projects --project "${projects[0].projectName}" for single project focus`));
    }
    if (projects.length > 0) {
      console.log(colors.hint(`Run stats cost --project "${projects[0].projectName}" for project cost breakdown`));
    }
    console.log();
    trackEvent('cli_stats', { duration_ms: Date.now() - startTime, subcommand: 'projects', period: flags.period, source_filter: flags.source ?? null, success: true });
    showTip('stats projects');
  } catch (err) {
    trackEvent('cli_stats', { duration_ms: Date.now() - startTime, subcommand: 'projects', period: flags.period, source_filter: flags.source ?? null, success: false });
    handleStatsError(err);
  }
}
