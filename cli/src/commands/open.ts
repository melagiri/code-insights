import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';

const DEFAULT_DASHBOARD_URL = 'https://claudeinsight.vercel.app';

/**
 * Generate the dashboard URL with encoded config
 */
function generateDashboardUrl(config: NonNullable<ReturnType<typeof loadConfig>>): string {
  const baseUrl = config.dashboardUrl || DEFAULT_DASHBOARD_URL;

  if (!config.webConfig) {
    return baseUrl;
  }

  // Create the Firebase config object for the web app
  const webFirebaseConfig = {
    apiKey: config.webConfig.apiKey,
    authDomain: config.webConfig.authDomain,
    projectId: config.firebase.projectId,
    storageBucket: config.webConfig.storageBucket,
    messagingSenderId: config.webConfig.messagingSenderId,
    appId: config.webConfig.appId,
  };

  // Base64 encode the config (URL-safe)
  const encodedConfig = Buffer.from(JSON.stringify(webFirebaseConfig))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${baseUrl}?config=${encodedConfig}`;
}

/**
 * Open the dashboard in the default browser
 */
async function openBrowser(url: string): Promise<void> {
  const { platform } = process;

  let command: string;
  let args: string[];

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    // Linux and others
    command = 'xdg-open';
    args = [url];
  }

  const { spawn } = await import('child_process');
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

/**
 * Open the ClaudeInsight dashboard
 */
export async function openCommand(options: { url?: boolean }): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error(chalk.red('Error: Not configured. Run `claudeinsight init` first.'));
    process.exit(1);
  }

  if (!config.webConfig) {
    console.log(chalk.yellow('\n⚠️  Web config not found in your configuration.'));
    console.log(chalk.gray('Run `claudeinsight init` again to add web dashboard config.\n'));

    const baseUrl = config.dashboardUrl || DEFAULT_DASHBOARD_URL;
    console.log(chalk.white(`Opening dashboard at: ${baseUrl}`));
    console.log(chalk.gray('You\'ll need to manually enter your Firebase config.\n'));

    if (!options.url) {
      await openBrowser(baseUrl);
    }
    return;
  }

  const dashboardUrl = generateDashboardUrl(config);

  if (options.url) {
    // Just print the URL
    console.log(dashboardUrl);
  } else {
    console.log(chalk.cyan('\n🚀 Opening ClaudeInsight Dashboard\n'));
    console.log(chalk.gray('URL: ') + chalk.white(dashboardUrl.split('?')[0]));
    console.log(chalk.gray('Config: ') + chalk.green('Auto-configured from CLI\n'));

    await openBrowser(dashboardUrl);

    console.log(chalk.gray('Dashboard opened in your default browser.'));
    console.log(chalk.gray('If it didn\'t open, copy this URL:\n'));
    console.log(chalk.white(dashboardUrl));
  }
}
