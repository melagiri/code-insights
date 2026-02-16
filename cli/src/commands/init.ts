import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig, saveWebConfig, getConfigDir, isConfigured } from '../utils/config.js';
import {
  readJsonFileWithError,
  readFirebaseConfigFile,
  validateServiceAccountJson,
  validateWebConfig,
  extractServiceAccountConfig,
  looksLikeWebConfig,
  looksLikeServiceAccount,
} from '../utils/firebase-json.js';
import type { ClaudeInsightConfig, FirebaseWebConfig } from '../types.js';

const DEFAULT_DASHBOARD_URL = 'https://code-insights.app';

export interface InitOptions {
  fromJson?: string;
  webConfig?: string;
}

/**
 * Initialize Code Insights configuration
 */
export async function initCommand(options: InitOptions): Promise<void> {
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

  // --- Step 1: Service Account ---
  let firebaseConfig: { projectId: string; clientEmail: string; privateKey: string };

  if (options.fromJson) {
    // Read from JSON file
    const result = readJsonFileWithError<Record<string, unknown>>(options.fromJson);

    if (!result.success) {
      console.log(chalk.red(`\n❌ ${result.message}`));
      process.exit(1);
    }

    // Cross-type detection: did they pass a web config by mistake?
    if (looksLikeWebConfig(result.data) && !looksLikeServiceAccount(result.data)) {
      console.log(chalk.red('\n❌ This looks like a web config file, not a service account.'));
      console.log(chalk.gray('Use --web-config for the web SDK config file.'));
      console.log(chalk.gray('Use --from-json for the service account key (downloaded from Firebase).\n'));
      process.exit(1);
    }

    if (!validateServiceAccountJson(result.data)) {
      console.log(chalk.red('\n❌ Invalid service account JSON.'));
      console.log(chalk.gray('Expected a file with: type, project_id, private_key, client_email'));
      console.log(chalk.gray('Download it from: Firebase Console > Project Settings > Service Accounts\n'));
      process.exit(1);
    }

    firebaseConfig = extractServiceAccountConfig(result.data);
    console.log(chalk.green(`✓ Service account loaded from ${options.fromJson}`));
    console.log(chalk.gray(`  Project: ${firebaseConfig.projectId}`));
  } else {
    // Interactive prompts
    console.log(chalk.bold('📋 Step 1: Service Account\n'));
    console.log(chalk.gray('You\'ll need your Firebase service account key JSON file.'));
    console.log(chalk.gray('Download from: Firebase Console > Project Settings > Service Accounts\n'));
    console.log(chalk.gray(chalk.bold('Tip:') + ' Use --from-json <path> to skip these prompts:\n'));
    console.log(chalk.gray('  code-insights init --from-json ~/Downloads/serviceAccountKey.json\n'));

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

    firebaseConfig = {
      projectId: answers.projectId,
      clientEmail: answers.clientEmail,
      privateKey: answers.privateKey,
    };
  }

  // --- Step 2: Web Config ---
  let webConfig: FirebaseWebConfig;

  if (options.webConfig) {
    // Read from file — supports both JSON and Firebase JS snippet format
    const result = readFirebaseConfigFile<Record<string, unknown>>(options.webConfig);

    if (!result.success) {
      console.log(chalk.red(`\n❌ ${result.message}`));
      process.exit(1);
    }

    // Cross-type detection: did they pass a service account by mistake?
    if (looksLikeServiceAccount(result.data) && !looksLikeWebConfig(result.data)) {
      console.log(chalk.red('\n❌ This looks like a service account file, not a web config.'));
      console.log(chalk.gray('Use --from-json for the service account key.'));
      console.log(chalk.gray('Use --web-config for the web SDK config.\n'));
      process.exit(1);
    }

    if (!validateWebConfig(result.data)) {
      console.log(chalk.red('\n❌ Invalid web config.'));
      console.log(chalk.gray('Expected: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId'));
      console.log(chalk.gray('Get it from: Firebase Console > Project Settings > General > Your Apps'));
      console.log(chalk.gray('You can paste the JavaScript snippet directly into a file — no need to convert to JSON.\n'));
      process.exit(1);
    }

    webConfig = result.data;
    console.log(chalk.green(`✓ Web config loaded from ${options.webConfig}`));
  } else {
    // Interactive prompts
    console.log(chalk.bold('\n🌐 Step 2: Web Dashboard Config\n'));
    console.log(chalk.gray('Get these from: Firebase Console > Project Settings > General > Your Apps\n'));
    console.log(chalk.gray(chalk.bold('Tip:') + ' Save the config as a JSON file and use --web-config <path> to skip these prompts.\n'));

    const answers = await inquirer.prompt([
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
        default: `${firebaseConfig.projectId}.firebaseapp.com`,
      },
      {
        type: 'input',
        name: 'storageBucket',
        message: 'Storage Bucket (storageBucket):',
        default: `${firebaseConfig.projectId}.appspot.com`,
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

    webConfig = {
      apiKey: answers.apiKey,
      authDomain: answers.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: answers.storageBucket,
      messagingSenderId: answers.messagingSenderId,
      appId: answers.appId,
    };
  }

  // --- Save config ---
  const config: ClaudeInsightConfig = {
    firebase: firebaseConfig,
    webConfig,
    sync: {
      claudeDir: '~/.claude/projects',
      excludeProjects: [],
    },
    dashboardUrl: DEFAULT_DASHBOARD_URL,
  };

  saveConfig(config);
  saveWebConfig(webConfig);

  console.log(chalk.green('\n✅ Configuration saved!'));
  console.log(chalk.gray(`Config location: ${getConfigDir()}/config.json`));

  console.log(chalk.cyan('\n🎉 Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     code-insights sync\n'));
  console.log(chalk.white('  2. Connect the dashboard:'));
  console.log(chalk.gray('     code-insights connect\n'));
}
