import inquirer from 'inquirer';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { saveConfig, getConfigDir, isConfigured, saveWebConfig } from '../utils/config.js';
import {
  readJsonFileWithError,
  validateServiceAccountJson,
  validateWebConfig,
  extractServiceAccountConfig,
  generateDashboardUrl,
  fileExists,
  looksLikeServiceAccount,
  looksLikeWebConfig,
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
  console.log(chalk.cyan('\n🔧 Code Insights Setup\n'));

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

  const result = readJsonFileWithError<FirebaseServiceAccountJson>(filePath);

  if (!result.success) {
    console.log(chalk.red(`❌ ${result.message}`));
    if (result.error === 'not_found') {
      console.log(chalk.gray('  Check the path and try again. Use ~ for home directory.'));
    } else if (result.error === 'invalid_json') {
      console.log(chalk.gray('  Ensure the file is valid JSON (not truncated or corrupted).'));
    }
    return null;
  }

  const json = result.data;

  // Cross-type detection: check if user provided web config instead of service account
  if (looksLikeWebConfig(json) && !looksLikeServiceAccount(json)) {
    console.log(chalk.red('❌ This looks like a Firebase Web SDK config, not a service account.'));
    console.log(chalk.gray('  Service account files contain "type": "service_account" and a private_key.'));
    console.log(chalk.gray('  Use --web-config for web SDK config files.'));
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
        validate: (input: string) => {
          if (!input.length) return 'File path is required';
          if (!fileExists(input)) return 'File not found. Check the path.';
          return true;
        },
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
    const result = readJsonFileWithError<FirebaseWebConfig>(providedPath);
    if (!result.success) {
      console.log(chalk.yellow(`⚠ ${result.message}`));
    } else {
      const json = result.data;
      // Cross-type detection
      if (looksLikeServiceAccount(json) && !looksLikeWebConfig(json)) {
        console.log(chalk.yellow('⚠ This looks like a service account, not a web config.'));
        console.log(chalk.gray('  Web config files contain apiKey, authDomain, etc.'));
      } else if (validateWebConfig(json)) {
        console.log(chalk.green('✓ Web config loaded'));
        return json;
      } else {
        console.log(chalk.yellow('⚠ Invalid web config structure. Missing required fields.'));
      }
    }
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
      validate: (input: string) => {
        if (!input.length) return 'File path is required';
        if (!fileExists(input)) return 'File not found. Check the path.';
        return true;
      },
    },
  ]);

  const result = readJsonFileWithError<FirebaseWebConfig>(filePath);
  if (!result.success) {
    console.log(chalk.yellow(`⚠ ${result.message}. Skipping web config.`));
    return undefined;
  }

  const json = result.data;
  if (looksLikeServiceAccount(json) && !looksLikeWebConfig(json)) {
    console.log(chalk.yellow('⚠ This looks like a service account, not a web config. Skipping.'));
    return undefined;
  }

  if (validateWebConfig(json)) {
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

  console.log(chalk.yellow('\n⚠ Note: Avoid sharing this URL publicly.'));

  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     code-insights sync\n'));
  console.log(chalk.white('  2. Open the dashboard link above to view your insights\n'));
}

/**
 * Show next steps when web config not provided
 */
function showNextStepsWithoutWebConfig(): void {
  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     code-insights sync\n'));
  console.log(chalk.white('  2. Visit the web dashboard and configure Firebase:'));
  console.log(chalk.gray('     https://code-insights.ai\n'));
  console.log(chalk.gray('  Tip: Run "code-insights link" anytime to generate a dashboard link\n'));
}
