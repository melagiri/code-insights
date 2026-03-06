import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';

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

async function reflectAction(options: {
  section?: string;
  period?: string;
  project?: string;
}): Promise<void> {
  const config = loadConfig();
  const port = config?.dashboard?.port || 7890;
  const baseUrl = `http://localhost:${port}`;

  // Check if server is running
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch {
    console.log(chalk.yellow('  Dashboard server is not running.'));
    console.log(chalk.dim('  Start it with: code-insights dashboard'));
    console.log();
    process.exit(1);
  }

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

  // Rules & Skills summary
  const rulesSkills = results['rules-skills'];
  if (rulesSkills) {
    console.log(chalk.bold('  Rules & Skills'));
    const rules = rulesSkills.claudeMdRules as Array<{ rule: string }> | undefined;
    if (rules && rules.length > 0) {
      console.log(chalk.dim('  CLAUDE.md rules:'));
      for (const r of rules) {
        console.log(`    ${chalk.cyan('→')} ${r.rule}`);
      }
    }
    const skills = rulesSkills.skillTemplates as Array<{ name: string }> | undefined;
    if (skills && skills.length > 0) {
      console.log(chalk.dim('  Skills:'));
      for (const s of skills) {
        console.log(`    ${chalk.cyan('→')} ${s.name}`);
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

export const reflectCommand = new Command('reflect')
  .description('Generate cross-session analysis (friction, rules, working style)')
  .option('--section <name>', 'Generate specific section: friction-wins, rules-skills, working-style')
  .option('-p, --period <period>', 'Time range: 7d, 30d, 90d, all', '30d')
  .option('--project <name>', 'Scope to a single project')
  .action(reflectAction);
