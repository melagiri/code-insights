import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { isConfigured, loadWebConfig, hasWebConfig } from '../utils/config.js';
import { generateDashboardUrl, validateWebConfig } from '../utils/firebase-json.js';
import type { FirebaseWebConfig } from '../types.js';

export interface LinkOptions {
  qr?: boolean;
}

/**
 * Generate and display dashboard link
 */
export async function linkCommand(options: LinkOptions): Promise<void> {
  if (!isConfigured()) {
    console.log(chalk.red('\n❌ Code Insights is not configured.'));
    console.log(chalk.gray('Run "code-insights init" first.\n'));
    return;
  }

  if (!hasWebConfig()) {
    console.log(chalk.yellow('\n⚠ No web config found.'));
    console.log(chalk.gray('\nTo generate a dashboard link, add web config:'));
    console.log(chalk.white('  code-insights init --web-config <path-to-config.json>\n'));
    console.log(chalk.gray('Or visit the dashboard and configure Firebase manually:'));
    console.log(chalk.white('  https://code-insights.ai\n'));
    return;
  }

  const webConfigData = loadWebConfig();
  if (!webConfigData || !validateWebConfig(webConfigData)) {
    console.log(chalk.red('\n❌ Invalid web config stored.'));
    console.log(chalk.gray('Run "code-insights init --web-config <path>" to reconfigure.\n'));
    return;
  }

  const webConfig = webConfigData as FirebaseWebConfig;
  const url = generateDashboardUrl(webConfig);

  console.log(chalk.cyan('\n🔗 Dashboard Link\n'));
  console.log(chalk.white('Open this URL to connect the dashboard:'));
  console.log(chalk.bold.underline(url));

  if (options.qr !== false) {
    console.log(chalk.gray('\n📱 QR Code:\n'));
    qrcode.generate(url, { small: true });
  }

  console.log('');
}
