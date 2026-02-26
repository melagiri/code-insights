// ──────────────────────────────────────────────────────
// stats today — Today's sessions with details
// ──────────────────────────────────────────────────────

import ora from 'ora';
import { trackEvent } from '../../../utils/telemetry.js';
import { resolveDataSource } from '../data/source.js';
import {
  computeTodayStats,
  shortenModelName,
} from '../data/aggregation.js';
import type { StatsFlags, SessionQueryOptions } from '../data/types.js';
import { colors } from '../render/colors.js';
import { handleStatsError } from './error-handler.js';
import {
  formatMoney,
  formatTokens,
  formatDuration,
  formatTime,
  formatRelativeDate,
  formatCount,
} from '../render/format.js';
import { sectionHeader, metricGrid, getTerminalWidth } from '../render/layout.js';
import { showTip } from '../../../utils/tips.js';

export async function todayAction(flags: StatsFlags): Promise<void> {
  try {
    const source = await resolveDataSource(flags);

    const spinner = ora({ text: 'Syncing...', indent: 2 }).start();
    try {
      const prepResult = await source.prepare(flags);
      spinner.succeed(prepResult.message);
    } catch {
      spinner.warn('Sync failed (showing cached data)');
    }

    // Resolve project filter (period is ignored for today — always today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const opts: SessionQueryOptions = {
      sourceTool: flags.source,
      periodStart: todayStart,
    };
    if (flags.project) {
      const resolved = await source.resolveProjectId(flags.project);
      opts.projectId = resolved.projectId;
    }

    const sessions = await source.getSessions(opts);
    const today = computeTodayStats(sessions);

    // Format date header
    const dateStr = today.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Empty state
    if (today.sessionCount === 0) {
      console.log(sectionHeader('TODAY', dateStr));
      console.log(`\n  No sessions yet today.\n`);
      const lastSession = await source.getLastSession({ sourceTool: opts.sourceTool, projectId: opts.projectId });
      if (lastSession) {
        console.log(`  Last session: ${formatRelativeDate(lastSession.endedAt)} in ${colors.project(lastSession.projectName)}`);
        console.log();
      }
      console.log(colors.hint('Run stats cost --period 7d for weekly cost trends'));
      console.log();
      return;
    }

    // Header
    console.log(sectionHeader('TODAY', dateStr));

    // Metric grid
    console.log();
    const gridMetrics = [
      { label: 'Sessions', value: formatCount(today.sessionCount) },
      { label: 'Cost', value: formatMoney(today.totalCost) },
      { label: 'Time', value: formatDuration(today.totalTimeMinutes) },
      { label: 'Messages', value: formatCount(today.messageCount) },
      { label: 'Tokens', value: formatTokens(today.totalTokens) },
    ];
    console.log(metricGrid(gridMetrics));

    // Divider
    const width = getTerminalWidth() - 4;
    console.log(`\n  ${colors.divider(width)}`);

    // Session list — most recent first
    const sortedSessions = [...today.sessions].reverse();
    const termWidth = getTerminalWidth();

    for (const session of sortedSessions) {
      const time = formatTime(session.startedAt);
      const dur = formatDuration(session.durationMinutes);
      const costStr = session.cost != null ? formatMoney(session.cost) : '\u2014';

      // Line 1: time, project name (left) — duration, cost (right)
      const leftPart = `  ${colors.timestamp(time.padEnd(10))}${colors.project(session.projectName)}`;
      const rightPart = `${dur}  ${costStr}`;
      const gap = Math.max(2, termWidth - 4 - time.length - 8 - session.projectName.length - rightPart.length);
      console.log(`\n${leftPart}${' '.repeat(gap)}${colors.value(rightPart)}`);

      // Line 2: title
      const title = session.title;
      if (title === 'Untitled Session') {
        console.log(`  ${''.padEnd(10)}${colors.label(title)}`);
      } else {
        console.log(`  ${''.padEnd(10)}${colors.value(title)}`);
      }

      // Line 3: character badge, model, message count
      const charBadge = session.sessionCharacter
        ? colors.character(session.sessionCharacter)
        : '';
      const modelStr = session.model
        ? colors.model(shortenModelName(session.model))
        : '\u2014';
      const msgStr = colors.label(`${session.messageCount} messages`);
      const parts = [charBadge, modelStr, msgStr].filter(Boolean);
      console.log(`  ${''.padEnd(10)}${parts.join('  ')}`);
    }

    // Footer divider + daily total
    console.log(`\n  ${colors.divider(width)}`);
    console.log(`  ${colors.value('Daily total')}    ${colors.label(`${today.sessionCount} sessions`)}    ${colors.money(today.totalCost)}    ${colors.label(formatDuration(today.totalTimeMinutes))}    ${colors.label(formatTokens(today.totalTokens) + ' tokens')}`);

    // Hints
    console.log();
    console.log(colors.hint('Run stats cost --period 7d for weekly cost trends'));
    console.log();
    trackEvent('stats', true, 'today');
    showTip('stats today');
  } catch (err) {
    trackEvent('stats', false, 'today');
    handleStatsError(err);
  }
}
