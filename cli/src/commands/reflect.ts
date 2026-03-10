import { Command } from 'commander';
import { createInterface } from 'readline';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function confirmPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function getBaseUrl(): string {
  const config = loadConfig();
  const port = config?.dashboard?.port || 7890;
  return `http://localhost:${port}`;
}

async function checkServer(baseUrl: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch {
    console.log(chalk.yellow('  Dashboard server is not running.'));
    console.log(chalk.dim('  Start it with: code-insights dashboard'));
    console.log();
    process.exit(1);
  }
}

async function checkLlmConfigured(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/config/llm`);
    if (res.ok) {
      const data = await res.json() as { provider?: string; model?: string };
      if (!data.provider || !data.model) {
        console.log(chalk.yellow('  LLM provider is not configured.'));
        console.log(chalk.dim('  Configure it with: code-insights config llm'));
        console.log();
        process.exit(1);
      }
    }
  } catch {
    // If config endpoint fails, let the backfill endpoint handle it
  }
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

async function fetchWithSSE(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Server error ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let result: Record<string, unknown> = {};

  const spinner = ora({ text: 'Starting...', indent: 2 }).start();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData) as Record<string, unknown>;

            if (currentEvent === 'progress') {
              spinner.text = (data.message as string) || 'Processing...';
            } else if (currentEvent === 'complete') {
              spinner.succeed('Analysis complete');
              result = data;
            } else if (currentEvent === 'error') {
              spinner.fail((data.error as string) || 'Generation failed');
            }
          } catch {
            // Skip malformed SSE events (e.g., truncated JSON from network issues)
          }

          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

async function backfillBatch(
  baseUrl: string,
  sessionIds: string[],
  offset: number,
  total: number,
  signal?: AbortSignal
): Promise<{ completed: number; failed: number }> {
  const res = await fetch(`${baseUrl}/api/facets/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // force=true so outdated sessions (which already have facets) are re-processed.
    // Missing sessions are unaffected — the guard only fires when a row exists.
    body: JSON.stringify({ sessionIds, force: true }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Server error ${res.status}: ${text}`);
  }
  if (!res.body) throw new Error('No response body');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let result = { completed: 0, failed: 0 };

  const spinner = ora({ text: `  Backfilling ${offset + 1}-${offset + sessionIds.length} of ${total}...`, indent: 2 }).start();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData) as Record<string, unknown>;
            if (currentEvent === 'progress') {
              const processed = (data.completed as number) + (data.failed as number);
              spinner.text = `  Backfilling ${offset + processed + 1} of ${total}...`;
            } else if (currentEvent === 'complete') {
              result = { completed: data.completed as number, failed: data.failed as number };
              spinner.succeed(`  Batch complete: ${result.completed} extracted, ${result.failed} failed`);
            }
          } catch { /* skip malformed */ }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function reflectAction(options: {
  section?: string;
  period?: string;
  project?: string;
}): Promise<void> {
  const baseUrl = getBaseUrl();

  await checkServer(baseUrl);

  // Check minimum session threshold
  const checkParams = new URLSearchParams();
  checkParams.set('period', options.period || '30d');
  if (options.project) checkParams.set('project', options.project);
  const aggRes = await fetch(`${baseUrl}/api/facets/aggregated?${checkParams.toString()}`);
  if (aggRes.ok) {
    const agg = await aggRes.json() as { totalSessions: number; totalAllSessions: number };
    if (agg.totalSessions < 20) {
      console.log(chalk.yellow(`  Not enough analyzed sessions for meaningful synthesis.`));
      console.log(chalk.dim(`  Need at least 20 sessions with facets (currently ${agg.totalSessions}).`));
      console.log(chalk.dim(`  Run session analysis to extract facets from more sessions.`));
      console.log();
      process.exit(1);
    }

    if (agg.totalAllSessions > 0 && agg.totalSessions / agg.totalAllSessions < 0.5) {
      console.log(chalk.yellow(`  Note: Only ${agg.totalSessions} of ${agg.totalAllSessions} sessions are analyzed.`));
      console.log(chalk.dim(`  Results may not represent your full patterns.`));
      console.log();
    }
  }

  const body: Record<string, unknown> = {
    period: options.period || '30d',
  };
  if (options.section) {
    body.sections = [options.section];
  }
  if (options.project) {
    body.project = options.project;
  }

  console.log();
  const data = await fetchWithSSE(`${baseUrl}/api/reflect/generate`, body);

  // Display results summary
  const results = data.results as Record<string, Record<string, unknown>> | undefined;
  if (!results) {
    console.log(chalk.dim('  No results generated.'));
    return;
  }

  console.log();

  // Friction & Wins summary
  const frictionWins = results['friction-wins'];
  if (frictionWins) {
    console.log(chalk.bold('  Friction & Wins'));
    if (frictionWins.narrative) {
      const lines = String(frictionWins.narrative).split('\n');
      for (const line of lines) {
        console.log(chalk.dim('  ') + line);
      }
    }
    console.log();
  }

  // Rules & Hooks summary
  const rulesSkills = results['rules-skills'];
  if (rulesSkills) {
    console.log(chalk.bold('  Rules & Hooks'));
    const rules = rulesSkills.claudeMdRules as Array<{ rule: string }> | undefined;
    if (rules && rules.length > 0) {
      console.log(chalk.dim('  CLAUDE.md rules:'));
      for (const r of rules) {
        console.log(`    ${chalk.cyan('→')} ${r.rule}`);
      }
    }
    const hooks = rulesSkills.hookConfigs as Array<{ event: string; command: string }> | undefined;
    if (hooks && hooks.length > 0) {
      console.log(chalk.dim('  Hooks:'));
      for (const h of hooks) {
        console.log(`    ${chalk.cyan('→')} ${h.event}: ${h.command}`);
      }
    }
    console.log();
  }

  // Working Style summary
  const workingStyle = results['working-style'];
  if (workingStyle) {
    console.log(chalk.bold('  Working Style'));
    if (workingStyle.narrative) {
      const lines = String(workingStyle.narrative).split('\n');
      for (const line of lines) {
        console.log(chalk.dim('  ') + line);
      }
    }
    console.log();
  }

  console.log(chalk.dim('  View full results: code-insights dashboard → Patterns'));
  console.log();
}

const BACKFILL_BATCH_SIZE = 200;

async function backfillAction(options: {
  period?: string;
  project?: string;
  dryRun?: boolean;
}): Promise<void> {
  const baseUrl = getBaseUrl();
  await checkServer(baseUrl);
  await checkLlmConfigured(baseUrl);

  const params = new URLSearchParams();
  params.set('period', options.period || 'all');
  if (options.project) params.set('project', options.project);

  const missingRes = await fetch(`${baseUrl}/api/facets/missing?${params.toString()}`);
  if (!missingRes.ok) {
    const text = await missingRes.text().catch(() => missingRes.statusText);
    console.log(chalk.red(`  Error: ${text}`));
    process.exit(1);
  }

  const { sessionIds: missingIds, count: missingCount } = await missingRes.json() as { sessionIds: string[]; count: number };

  const outdatedRes = await fetch(`${baseUrl}/api/facets/outdated?${params.toString()}`);
  if (!outdatedRes.ok) {
    const text = await outdatedRes.text().catch(() => outdatedRes.statusText);
    console.log(chalk.red(`  Error fetching outdated sessions: ${text}`));
    process.exit(1);
  }

  const { sessionIds: outdatedIds, count: outdatedCount } = await outdatedRes.json() as { sessionIds: string[]; count: number };

  // Merge and deduplicate — a session could theoretically appear in both lists
  // (e.g., if it got a partial facets row). Set deduplication ensures we count correctly.
  const mergedSet = new Set([...missingIds, ...outdatedIds]);
  const sessionIds = Array.from(mergedSet);
  const count = sessionIds.length;

  console.log();
  if (count === 0) {
    console.log(chalk.green('  All analyzed sessions already have up-to-date facets.'));
    console.log();
    return;
  }

  if (missingCount > 0 && outdatedCount > 0) {
    console.log(chalk.cyan(`  Found ${missingCount} session${missingCount !== 1 ? 's' : ''} missing facets and ${outdatedCount} with outdated analysis. Processing ${count} total.`));
  } else if (missingCount > 0) {
    console.log(chalk.cyan(`  Found ${missingCount} session${missingCount !== 1 ? 's' : ''} with insights but missing facets.`));
  } else {
    console.log(chalk.cyan(`  Found ${outdatedCount} session${outdatedCount !== 1 ? 's' : ''} with outdated analysis.`));
  }
  console.log(chalk.dim(`  This will make ${count} LLM call${count !== 1 ? 's' : ''}.`));

  if (options.dryRun) {
    console.log(chalk.dim('  (dry run — no changes made)'));
    console.log();
    return;
  }

  // Confirm before proceeding — each call costs tokens
  const confirmed = await confirmPrompt('  Continue?');
  if (!confirmed) {
    console.log(chalk.dim('  Aborted.'));
    console.log();
    return;
  }

  console.log();

  let totalCompleted = 0;
  let totalFailed = 0;

  for (let i = 0; i < sessionIds.length; i += BACKFILL_BATCH_SIZE) {
    const batch = sessionIds.slice(i, i + BACKFILL_BATCH_SIZE);
    const { completed, failed } = await backfillBatch(baseUrl, batch, i, sessionIds.length);
    totalCompleted += completed;
    totalFailed += failed;
  }

  console.log();
  console.log(chalk.bold('  Summary'));
  console.log(chalk.green(`    ${totalCompleted} sessions backfilled`));
  if (totalFailed > 0) {
    console.log(chalk.yellow(`    ${totalFailed} sessions failed`));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

const backfillCommand = new Command('backfill')
  .description('Extract facets for sessions that have insights but are missing pattern data')
  .option('-p, --period <period>', 'Time range: 7d, 30d, 90d, all', 'all')
  .option('--project <name>', 'Scope to a single project')
  .option('--dry-run', 'Show count without backfilling')
  .action(backfillAction);

export const reflectCommand = new Command('reflect')
  .description('Generate cross-session analysis (friction, rules, working style)')
  .option('--section <name>', 'Generate specific section: friction-wins, rules-skills, working-style')
  .option('-p, --period <period>', 'Time range: 7d, 30d, 90d, all', '30d')
  .option('--project <name>', 'Scope to a single project')
  .addCommand(backfillCommand)
  .action(reflectAction);
