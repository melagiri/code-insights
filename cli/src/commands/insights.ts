import chalk from 'chalk';
import { format } from 'date-fns';
import { loadConfig, isConfigured } from '../utils/config.js';
import { initializeFirebase, getRecentInsights } from '../firebase/client.js';
import type { Insight, InsightType } from '../types.js';

interface InsightsOptions {
  type?: InsightType;
  project?: string;
  today?: boolean;
  limit?: number;
}

/**
 * Display recent insights from Firestore
 */
export async function insightsCommand(options: InsightsOptions = {}): Promise<void> {
  // Check if configured
  if (!isConfigured()) {
    console.log(chalk.red('Not configured. Run `claudeinsight init` first.'));
    process.exit(1);
  }

  // Load config and initialize Firebase
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('Configuration error.'));
    process.exit(1);
  }

  try {
    initializeFirebase(config);
  } catch (error) {
    console.log(chalk.red('Failed to connect to Firebase.'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  const limit = options.limit || 20;

  // Fetch insights
  const insights = await getRecentInsights(limit, {
    type: options.type,
    project: options.project,
    todayOnly: options.today,
  });

  if (insights.length === 0) {
    console.log(chalk.yellow('\nNo insights found.'));
    if (options.today) {
      console.log(chalk.gray('Try running without --today to see older insights.'));
    }
    return;
  }

  console.log(chalk.cyan(`\n📊 Recent Insights (${insights.length})\n`));

  // Group by type
  const summaries = insights.filter((i) => i.type === 'summary');
  const decisions = insights.filter((i) => i.type === 'decision');
  const learnings = insights.filter((i) => i.type === 'learning');
  const techniques = insights.filter((i) => i.type === 'technique');

  if (summaries.length > 0) {
    console.log(chalk.bold.magenta('📝 Summaries'));
    for (const insight of summaries) {
      printInsight(insight);
    }
    console.log();
  }

  if (decisions.length > 0) {
    console.log(chalk.bold.blue('🎯 Decisions'));
    for (const insight of decisions) {
      printInsight(insight);
    }
    console.log();
  }

  if (learnings.length > 0) {
    console.log(chalk.bold.green('💡 Learnings'));
    for (const insight of learnings) {
      printInsight(insight);
    }
    console.log();
  }

  if (techniques.length > 0) {
    console.log(chalk.bold.yellow('🔧 Techniques'));
    for (const insight of techniques) {
      printInsight(insight);
    }
    console.log();
  }
}

function printInsight(insight: Insight): void {
  const date = insight.timestamp
    ? format(new Date(insight.timestamp), 'MMM d')
    : 'Unknown';

  console.log(chalk.white(`  • ${insight.title}`));
  console.log(chalk.gray(`    ${insight.projectName} | ${date}`));
  if (insight.content && insight.content.length < 100) {
    console.log(chalk.gray(`    ${insight.content}`));
  }
}
