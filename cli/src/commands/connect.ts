import chalk from 'chalk';
import { isConfigured, loadWebConfig, hasWebConfig } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import { generateDashboardUrl, validateWebConfig } from '../utils/firebase-json.js';
import type { FirebaseWebConfig } from '../types.js';

/**
 * Generate and display the dashboard connection URL
 */
export async function connectCommand(): Promise<void> {
  if (!isConfigured()) {
    console.log(chalk.red('\n❌ Code Insights is not configured.'));
    console.log(chalk.gray('The connect command requires Firebase setup.\n'));
    console.log(chalk.white('  To set up Firebase:'));
    console.log(chalk.gray('    code-insights init\n'));
    console.log(chalk.white('  For local-only analytics (no setup needed):'));
    console.log(chalk.gray('    code-insights stats\n'));
    return;
  }

  if (!hasWebConfig()) {
    console.log(chalk.yellow('\n⚠ No web config found.'));
    console.log(chalk.gray('\nRe-run "code-insights init" to add your web config.'));
    console.log(chalk.gray('Or visit the dashboard and configure Firebase manually:'));
    console.log(chalk.white('  https://code-insights.app\n'));
    return;
  }

  const webConfigData = loadWebConfig();
  if (!webConfigData || !validateWebConfig(webConfigData)) {
    console.log(chalk.red('\n❌ Invalid web config stored.'));
    console.log(chalk.gray('Run "code-insights init" to reconfigure.\n'));
    return;
  }

  const webConfig = webConfigData as FirebaseWebConfig;
  const url = generateDashboardUrl(webConfig);

  console.log(chalk.cyan('\n🔗 Dashboard Connection URL\n'));
  console.log(chalk.white('Open this URL to connect the dashboard to your Firebase:'));
  console.log(chalk.bold.underline(url));
  console.log('');
  trackEvent('connect', true);
}
