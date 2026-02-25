// ──────────────────────────────────────────────────────
// stats (no args) — Dashboard overview
// ──────────────────────────────────────────────────────

import ora from 'ora';
import { trackEvent } from '../../../utils/telemetry.js';
import { resolveDataSource } from '../data/source.js';
import {
  periodStartDate,
  computeOverview,
  resolveTitle,
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
import { sparkline, sparklineLabels } from '../render/charts.js';
import { barChart } from '../render/charts.js';
import { sectionHeader, metricGrid, getBarWidth } from '../render/layout.js';
import { showWelcomeIfFirstRun } from '../../../utils/welcome.js';
import { showTip } from '../../../utils/tips.js';
import { isConfigured } from '../../../utils/config.js';

export async function overviewAction(flags: StatsFlags): Promise<void> {
  try {
    const source = await resolveDataSource(flags);

    const spinner = ora({ text: 'Syncing...', indent: 2 }).start();
    try {
      const prepResult = await source.prepare(flags);
      spinner.succeed(prepResult.message);
    } catch {
      spinner.warn('Sync failed (showing cached data)');
    }

    // Show welcome message on first ever run (no config file)
    if (!isConfigured()) {
      showWelcomeIfFirstRun();
    }

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

    // Empty state: no sessions at all
    if (sessions.length === 0 && !opts.periodStart) {
      console.log(`\n  No sessions found.\n`);
      console.log(`  Get started:`);
      console.log(`    1. Use Claude Code, Cursor, or Codex on a project`);
      console.log(`    2. Run ${colors.value('code-insights sync')} to upload your sessions`);
      console.log(`    3. Run ${colors.value('code-insights stats')} to see your analytics\n`);
      showTip('stats');
      return;
    }

    // Empty state: no sessions in period
    if (sessions.length === 0) {
      const periodLabel = formatPeriodLabel(flags.period);
      console.log(sectionHeader('CODE INSIGHTS', periodLabel));
      console.log(`\n  No sessions in the ${periodLabel.toLowerCase()}.\n`);
      const lastSession = await source.getLastSession();
      if (lastSession) {
        const title = resolveTitle(lastSession);
        console.log(`  Last session: ${formatRelativeDate(lastSession.endedAt)} in ${colors.project(lastSession.projectName)} — ${colors.value(title)}`);
        console.log();
      }
      console.log(colors.hint(`Run stats --period 30d to expand the time range`));
      console.log();
      return;
    }

    const stats = computeOverview(sessions, flags.period);
    const periodLabel = formatPeriodLabel(flags.period);

    // Header
    let headerTitle = 'CODE INSIGHTS';
    if (flags.project) headerTitle += ` \u2014 ${flags.project}`;
    if (flags.source) headerTitle += ` \u2014 ${flags.source} only`;
    console.log(sectionHeader(headerTitle, periodLabel));

    // Metric grid
    const isProjectScoped = !!flags.project;
    const modelCount = new Set(sessions.map(s => s.primaryModel).filter(Boolean)).size;

    console.log();
    console.log(metricGrid([
      { label: 'Sessions', value: formatCount(stats.sessionCount) },
      { label: 'Cost', value: formatMoney(stats.totalCost) },
      { label: 'Time', value: formatDuration(stats.totalTimeMinutes) },
      { label: 'Messages', value: formatCount(stats.messageCount) },
      { label: 'Tokens', value: formatTokens(stats.totalTokens) },
      { label: isProjectScoped ? 'Models' : 'Projects', value: formatCount(isProjectScoped ? modelCount : stats.projectCount) },
    ]));

    // Activity sparkline
    const spark = sparkline(stats.activityByDay.map(d => d.value));
    const labels = sparklineLabels(flags.period);
    console.log(sectionHeader('ACTIVITY', spark));
    if (labels) {
      // Right-align labels under the sparkline in the header
      console.log(`  ${colors.label(labels)}`);
    }

    // Quick stats: today / yesterday / this week
    console.log();
    console.log(`  ${colors.value('Today'.padEnd(14))} ${colors.label(`${stats.todayStats.sessionCount} sessions`)}    ${colors.money(stats.todayStats.totalCost)}    ${colors.label(formatDuration(stats.todayStats.totalMinutes))}`);
    console.log(`  ${colors.value('Yesterday'.padEnd(14))} ${colors.label(`${stats.yesterdayStats.sessionCount} sessions`)}    ${colors.money(stats.yesterdayStats.totalCost)}    ${colors.label(formatDuration(stats.yesterdayStats.totalMinutes))}`);
    console.log(`  ${colors.value('This week'.padEnd(14))} ${colors.label(`${stats.weekStats.sessionCount} sessions`)}    ${colors.money(stats.weekStats.totalCost)}    ${colors.label(formatDuration(stats.weekStats.totalMinutes))}`);

    // Top projects (or models if project-scoped)
    if (isProjectScoped) {
      const models = new Set(sessions.map(s => s.primaryModel).filter((m): m is string => m != null));
      if (models.size > 0) {
        console.log(`\n  ${colors.label('Models used:')} ${[...models].map(m => colors.model(shortenModelName(m))).join(', ')}`);
      }
    } else if (stats.topProjects.length > 0) {
      console.log(sectionHeader('TOP PROJECTS'));
      const barWidth = getBarWidth();
      const lines = barChart(
        stats.topProjects.map(p => ({
          label: p.name,
          value: p.count,
          suffix: `${colors.label(`${p.count} sessions`)}   ${colors.money(p.cost)}`,
        })),
        barWidth,
      );
      for (const line of lines) {
        console.log(line);
      }
    }

    // Sources section (only if 2+ source tools)
    if (stats.sourceTools.length >= 2) {
      console.log(sectionHeader('SOURCES'));
      const barWidth = getBarWidth();
      const lines = barChart(
        stats.sourceTools.map(s => ({
          label: s.name,
          value: s.count,
          suffix: `${colors.label(`${s.count} sessions`)}   ${colors.money(s.cost)}`,
        })),
        barWidth,
      );
      for (const line of lines) {
        console.log(line);
      }
    }

    // Hints
    console.log();
    console.log(colors.hint('Run stats cost for cost breakdown'));
    console.log(colors.hint("Run stats today for today's sessions"));
    console.log(colors.hint('Run stats projects for project details'));
    console.log();
    trackEvent('stats', true);
    showTip('stats');
  } catch (err) {
    trackEvent('stats', false);
    handleStatsError(err);
  }
}
