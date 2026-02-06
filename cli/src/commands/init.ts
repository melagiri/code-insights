import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig, getConfigDir, isConfigured } from '../utils/config.js';
import type { ClaudeInsightConfig } from '../types.js';

const DEFAULT_DASHBOARD_URL = 'https://code-insights.ai';

/**
 * Initialize Code Insights configuration
 */
export async function initCommand(): Promise<void> {
  console.log(chalk.cyan('\n🔧 Code Insights Setup\n'));

  if (isConfigured()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration already exists. Overwrite?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }
  }

  // Step 1: Service Account (for CLI sync)
  console.log(chalk.bold('\n📋 Step 1: CLI Sync Configuration\n'));
  console.log(chalk.gray('You\'ll need your Firebase service account credentials.'));
  console.log(chalk.gray('Get them from: Firebase Console > Project Settings > Service Accounts'));
  console.log(chalk.gray('Click "Generate New Private Key" and open the downloaded JSON file.\n'));

  const serviceAccountAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectId',
      message: 'Firebase Project ID:',
      validate: (input: string) => input.length > 0 || 'Project ID is required',
    },
    {
      type: 'input',
      name: 'clientEmail',
      message: 'Service Account Email (client_email from JSON):',
      validate: (input: string) =>
        input.includes('@') || 'Please enter a valid service account email',
    },
    {
      type: 'password',
      name: 'privateKey',
      message: 'Private Key (private_key from JSON, including BEGIN/END):',
      validate: (input: string) =>
        input.includes('PRIVATE KEY') || 'Please paste the complete private key',
    },
  ]);

  // Step 2: Web Dashboard Config
  console.log(chalk.bold('\n🌐 Step 2: Web Dashboard Configuration\n'));
  console.log(chalk.gray('Now we need the Firebase Web SDK config for the dashboard.'));
  console.log(chalk.gray('Get it from: Firebase Console > Project Settings > General'));
  console.log(chalk.gray('Scroll to "Your apps" section and copy the config values.\n'));

  const webConfigAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key (apiKey):',
      validate: (input: string) => input.length > 0 || 'API Key is required',
    },
    {
      type: 'input',
      name: 'authDomain',
      message: 'Auth Domain (authDomain):',
      default: `${serviceAccountAnswers.projectId}.firebaseapp.com`,
    },
    {
      type: 'input',
      name: 'storageBucket',
      message: 'Storage Bucket (storageBucket):',
      default: `${serviceAccountAnswers.projectId}.appspot.com`,
    },
    {
      type: 'input',
      name: 'messagingSenderId',
      message: 'Messaging Sender ID (messagingSenderId):',
      validate: (input: string) => input.length > 0 || 'Messaging Sender ID is required',
    },
    {
      type: 'input',
      name: 'appId',
      message: 'App ID (appId):',
      validate: (input: string) => input.length > 0 || 'App ID is required',
    },
  ]);

  // Step 3: Dashboard URL (optional)
  console.log(chalk.bold('\n🚀 Step 3: Dashboard URL (optional)\n'));

  const { dashboardUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dashboardUrl',
      message: 'Dashboard URL (press Enter for hosted version):',
      default: DEFAULT_DASHBOARD_URL,
    },
  ]);

  const config: ClaudeInsightConfig = {
    firebase: {
      projectId: serviceAccountAnswers.projectId,
      clientEmail: serviceAccountAnswers.clientEmail,
      privateKey: serviceAccountAnswers.privateKey,
    },
    webConfig: {
      apiKey: webConfigAnswers.apiKey,
      authDomain: webConfigAnswers.authDomain,
      storageBucket: webConfigAnswers.storageBucket,
      messagingSenderId: webConfigAnswers.messagingSenderId,
      appId: webConfigAnswers.appId,
    },
    sync: {
      claudeDir: '~/.claude/projects',
      excludeProjects: [],
    },
    dashboardUrl: dashboardUrl,
  };

  saveConfig(config);

  console.log(chalk.green('\n✅ Configuration saved!'));
  console.log(chalk.gray(`Config location: ${getConfigDir()}/config.json`));

  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     code-insights sync\n'));
  console.log(chalk.white('  2. Open the dashboard:'));
  console.log(chalk.gray('     code-insights link\n'));
}
