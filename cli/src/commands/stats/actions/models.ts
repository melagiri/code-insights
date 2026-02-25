// ──────────────────────────────────────────────────────
// stats models — Model usage distribution + cost
// ──────────────────────────────────────────────────────

import ora from 'ora';
import { trackEvent } from '../../../utils/telemetry.js';
import { resolveDataSource } from '../data/source.js';
import { periodStartDate, computeModelStats } from '../data/aggregation.js';
import type { StatsFlags, SessionQueryOptions } from '../data/types.js';
import { colors } from '../render/colors.js';
import { handleStatsError } from './error-handler.js';
import {
  formatMoney,
  formatTokens,
  formatPercent,
  formatCount,
  formatPeriodLabel,
} from '../render/format.js';
import { sparkline } from '../render/charts.js';
import { barChart } from '../render/charts.js';
import { sectionHeader, metricGrid, getBarWidth, projectCardHeader } from '../render/layout.js';
import { showTip } from '../../../utils/tips.js';

export async function modelsAction(flags: StatsFlags): Promise<void> {
  try {
    const source = await resolveDataSource(flags);

    const spinner = ora({ text: 'Syncing...', indent: 2 }).start();
    try {
      const prepResult = await source.prepare(flags);
      spinner.succeed(prepResult.message);
    } catch {
      spinner.warn('Sync failed (showing cached data)');
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
    const periodLabel = formatPeriodLabel(flags.period);

    // Empty state
    if (sessions.length === 0) {
      console.log(sectionHeader('MODEL USAGE', periodLabel));
      console.log(`\n  No sessions found in the ${periodLabel.toLowerCase()}.\n`);
      console.log(colors.hint('Run stats --period 30d to expand the time range'));
      console.log();
      return;
    }

    const models = computeModelStats(sessions, flags.period);

    // No model data
    if (models.length === 0) {
      console.log(sectionHeader('MODEL USAGE', periodLabel));
      console.log(`\n  No model data available.\n`);
      console.log(colors.hint('Model data is captured from Claude Code usage logs'));
      console.log();
      return;
    }

    // Header
    console.log(sectionHeader('MODEL USAGE', periodLabel));

    // Summary
    const totalSessions = models.reduce((sum, m) => sum + m.sessionCount, 0);
    console.log(`\n  ${colors.value(String(models.length))} models across ${colors.value(formatCount(totalSessions))} sessions`);

    // Model cards
    for (const model of models) {
      console.log(projectCardHeader(model.displayName));

      console.log(metricGrid([
        { label: 'Sessions', value: `${formatCount(model.sessionCount)} (${formatPercent(model.sessionPercent)})` },
        { label: 'Cost', value: `${formatMoney(model.totalCost)} (${formatPercent(model.costPercent)})` },
        { label: 'Tokens', value: formatTokens(model.totalTokens) },
        { label: 'Avg/session', value: formatMoney(model.avgCostPerSession) },
      ]));

      // Input / Output / Cache cost breakdown
      console.log(`  ${colors.label('Input')}     ${colors.money(model.inputCost)}${''.padEnd(10)}${colors.label('Output')}  ${colors.money(model.outputCost)}${''.padEnd(6)}${colors.label('Cache')}  ${colors.money(model.cacheCost)}`);

      // Trend sparkline
      const spark = sparkline(model.trend.map(d => d.value));
      if (spark) {
        console.log(`  ${colors.label('Trend')}     ${spark}`);
      }
    }

    // Cost distribution bar chart
    if (models.length > 1) {
      console.log(sectionHeader('COST DISTRIBUTION'));
      const barWidth = getBarWidth();
      const lines = barChart(
        models.map(m => ({
          label: m.displayName,
          value: m.totalCost,
          suffix: `${formatPercent(m.costPercent)}  ${colors.money(m.totalCost)}`,
        })),
        barWidth,
      );
      for (const line of lines) {
        console.log(line);
      }
    }

    // Hints
    console.log();
    console.log(colors.hint('Run stats cost for time-based cost analysis'));
    console.log();
    trackEvent('stats', true, 'models');
    showTip('stats models');
  } catch (err) {
    trackEvent('stats', false, 'models');
    handleStatsError(err);
  }
}
