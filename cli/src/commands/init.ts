import inquirer from 'inquirer';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { saveConfig, getConfigDir, isConfigured, saveWebConfig } from '../utils/config.js';
import {
  readJsonFile,
  validateServiceAccountJson,
  validateWebConfig,
  extractServiceAccountConfig,
  generateDashboardUrl,
} from '../utils/firebase-json.js';
import type {
  ClaudeInsightConfig,
  FirebaseServiceAccountJson,
  FirebaseWebConfig
} from '../types.js';

export interface InitOptions {
  fromJson?: string;
  webConfig?: string;
}

/**
 * Initialize ClaudeInsight configuration
 */
export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.cyan('\n🔧 ClaudeInsight Setup\n'));

  // Check for existing configuration
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

  let serviceAccountConfig: ClaudeInsightConfig['firebase'];
  let webConfig: FirebaseWebConfig | undefined;

  // Path 1: JSON file import via --from-json flag
  if (options.fromJson) {
    const result = await initFromJsonFile(options.fromJson);
    if (!result) return;
    serviceAccountConfig = result;
  } else {
    // Path 2: Interactive prompts
    serviceAccountConfig = await promptForServiceAccount();
  }

  // Handle web config (via flag or prompt)
  webConfig = await handleWebConfig(options.webConfig);

  // Save configuration
  const config: ClaudeInsightConfig = {
    firebase: serviceAccountConfig,
    sync: {
      claudeDir: '~/.claude/projects',
      excludeProjects: [],
    },
  };

  saveConfig(config);

  // Save web config separately if provided
  if (webConfig) {
    saveWebConfig(webConfig);
  }

  // Success output
  console.log(chalk.green('\n✅ Configuration saved!'));
  console.log(chalk.gray(`Config location: ${getConfigDir()}/config.json`));

  // Show next steps with or without web config
  if (webConfig) {
    showDashboardLink(webConfig);
  } else {
    showNextStepsWithoutWebConfig();
  }
}

/**
 * Initialize from JSON file
 */
async function initFromJsonFile(
  filePath: string
): Promise<ClaudeInsightConfig['firebase'] | null> {
  console.log(chalk.gray(`Reading service account from: ${filePath}\n`));

  const json = readJsonFile<FirebaseServiceAccountJson>(filePath);

  if (!json) {
    console.log(chalk.red('❌ Could not read file. Check the path and try again.'));
    return null;
  }

  if (!validateServiceAccountJson(json)) {
    console.log(chalk.red('❌ Invalid service account JSON file.'));
    console.log(chalk.gray('Expected a Firebase service account key file with:'));
    console.log(chalk.gray('  - type: "service_account"'));
    console.log(chalk.gray('  - project_id, client_email, private_key'));
    return null;
  }

  const config = extractServiceAccountConfig(json);
  console.log(chalk.green(`✓ Service account loaded for project: ${config.projectId}`));

  return config;
}

/**
 * Interactive prompts for service account
 */
async function promptForServiceAccount(): Promise<ClaudeInsightConfig['firebase']> {
  console.log(chalk.bold('📋 Firebase Service Account Configuration\n'));
  console.log(chalk.gray("You'll need your Firebase service account credentials."));
  console.log(chalk.gray('Get them from: Firebase Console > Project Settings > Service Accounts'));
  console.log(chalk.gray('Click "Generate New Private Key" and download the JSON file.\n'));

  const { useJsonFile } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useJsonFile',
      message: 'Do you have the service account JSON file downloaded?',
      default: true,
    },
  ]);

  if (useJsonFile) {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: 'Path to service account JSON file:',
        validate: (input: string) => input.length > 0 || 'File path is required',
      },
    ]);

    const result = await initFromJsonFile(filePath);
    if (result) return result;

    console.log(chalk.yellow('\nFalling back to manual entry...\n'));
  }

  // Manual entry fallback
  const answers = await inquirer.prompt([
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

  return {
    projectId: answers.projectId,
    clientEmail: answers.clientEmail,
    privateKey: answers.privateKey,
  };
}

/**
 * Handle web config - via flag or interactive prompt
 */
async function handleWebConfig(
  providedPath?: string
): Promise<FirebaseWebConfig | undefined> {
  // If path provided via CLI flag
  if (providedPath) {
    const json = readJsonFile<FirebaseWebConfig>(providedPath);
    if (json && validateWebConfig(json)) {
      console.log(chalk.green('✓ Web config loaded'));
      return json;
    }
    console.log(chalk.yellow('⚠ Could not load web config from provided path'));
  }

  console.log(chalk.bold('\n🌐 Web Dashboard Configuration (Optional)\n'));
  console.log(chalk.gray('To connect the web dashboard, you need the Firebase Web SDK config.'));
  console.log(chalk.gray('Find it in: Firebase Console > Project Settings > General > Your Apps\n'));

  const { hasWebConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasWebConfig',
      message: 'Do you have the Firebase Web SDK config?',
      default: false,
    },
  ]);

  if (!hasWebConfig) {
    return undefined;
  }

  const { inputMethod } = await inquirer.prompt([
    {
      type: 'list',
      name: 'inputMethod',
      message: 'How would you like to provide the web config?',
      choices: [
        { name: 'Provide path to JSON file', value: 'file' },
        { name: 'Skip for now', value: 'skip' },
      ],
    },
  ]);

  if (inputMethod === 'skip') {
    return undefined;
  }

  const { filePath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filePath',
      message: 'Path to web config JSON file:',
    },
  ]);

  const json = readJsonFile<FirebaseWebConfig>(filePath);
  if (json && validateWebConfig(json)) {
    console.log(chalk.green('✓ Web config loaded'));
    return json;
  }

  console.log(chalk.yellow('⚠ Invalid web config file. Skipping web config.'));
  return undefined;
}

/**
 * Display dashboard link with QR code
 */
function showDashboardLink(webConfig: FirebaseWebConfig): void {
  const url = generateDashboardUrl(webConfig);

  console.log(chalk.cyan('\n🔗 Web Dashboard Setup\n'));
  console.log(chalk.white('Open this URL to connect the dashboard:'));
  console.log(chalk.bold.underline(url));

  console.log(chalk.gray('\n📱 Or scan this QR code:\n'));
  qrcode.generate(url, { small: true });

  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     claudeinsight sync\n'));
  console.log(chalk.white('  2. Open the dashboard link above to view your insights\n'));
}

/**
 * Show next steps when web config not provided
 */
function showNextStepsWithoutWebConfig(): void {
  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     claudeinsight sync\n'));
  console.log(chalk.white('  2. Visit the web dashboard and configure Firebase:'));
  console.log(chalk.gray('     https://claude-insights.vercel.app\n'));
  console.log(chalk.gray('  Tip: Run "claudeinsight link" anytime to generate a dashboard link\n'));
}
