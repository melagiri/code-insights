# Simplified Firebase Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Firebase configuration from 8 manual field entries to a single file import with automatic web dashboard linking.

**Architecture:** CLI accepts Firebase JSON files directly, stores both service account and web config, and generates shareable URLs/QR codes for seamless web dashboard connection. Web app auto-configures from URL parameters.

**Tech Stack:** Node.js, Commander.js, qrcode-terminal, base64url encoding

---

## Current State

**CLI Setup (3 manual prompts):**
- projectId
- clientEmail
- privateKey

**Web Setup (5 manual fields in Settings):**
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

**Total: 8 manual field entries across 2 UIs**

---

## Target State

```
$ claudeinsight init --from-json ~/Downloads/serviceAccountKey.json

✓ Service account loaded for project: my-project

🌐 Web Dashboard Configuration (Optional)

Do you have the Firebase Web SDK config? (Y/n) y
How would you like to provide the web config?
  > Provide path to JSON file
    Skip for now

Path to web config JSON file: ~/Downloads/firebase-web-config.json
✓ Web config loaded

🔗 Web Dashboard Setup

Open this URL to connect the dashboard:
https://claude-insights.vercel.app/?config=eyJhcGlLZXk...

📱 Or scan this QR code:
[QR CODE]

✅ Setup complete! Run 'claudeinsight sync' to upload your sessions.
```

---

## Task 1: Add Firebase JSON File Types

**Files:**
- Modify: `cli/src/types.ts`

**Step 1: Add new type definitions**

Add these types after the existing `ClaudeInsightConfig` interface (around line 154):

```typescript
/**
 * Firebase Service Account JSON file structure
 * Downloaded from Firebase Console > Project Settings > Service Accounts
 */
export interface FirebaseServiceAccountJson {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

/**
 * Firebase Web SDK config
 * Found in Firebase Console > Project Settings > General > Your Apps > Web App
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}
```

**Step 2: Commit**

```bash
git add cli/src/types.ts
git commit -m "feat(cli): add Firebase JSON file type definitions"
```

---

## Task 2: Add JSON File Validation Utilities

**Files:**
- Create: `cli/src/utils/firebase-json.ts`

**Step 1: Create the validation utility file**

```typescript
import * as fs from 'fs';
import type { FirebaseServiceAccountJson, FirebaseWebConfig } from '../types.js';

/**
 * Validate Firebase Service Account JSON structure
 */
export function validateServiceAccountJson(data: unknown): data is FirebaseServiceAccountJson {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  return (
    obj.type === 'service_account' &&
    typeof obj.project_id === 'string' &&
    typeof obj.private_key === 'string' &&
    typeof obj.client_email === 'string' &&
    obj.private_key.includes('-----BEGIN PRIVATE KEY-----')
  );
}

/**
 * Validate Firebase Web SDK config structure
 */
export function validateWebConfig(data: unknown): data is FirebaseWebConfig {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.apiKey === 'string' &&
    typeof obj.authDomain === 'string' &&
    typeof obj.projectId === 'string' &&
    typeof obj.storageBucket === 'string' &&
    typeof obj.messagingSenderId === 'string' &&
    typeof obj.appId === 'string'
  );
}

/**
 * Read and parse a JSON file
 */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    const resolvedPath = filePath.replace(/^~/, process.env.HOME || '');
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Extract service account config from JSON file
 */
export function extractServiceAccountConfig(json: FirebaseServiceAccountJson) {
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key,
  };
}

/**
 * Encode web config for URL parameter (base64url encoding)
 */
export function encodeWebConfigForUrl(config: FirebaseWebConfig): string {
  const json = JSON.stringify(config);
  return Buffer.from(json, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate the web dashboard URL with embedded config
 */
export function generateDashboardUrl(config: FirebaseWebConfig): string {
  const encodedConfig = encodeWebConfigForUrl(config);
  return `https://claude-insights.vercel.app/?config=${encodedConfig}`;
}
```

**Step 2: Commit**

```bash
git add cli/src/utils/firebase-json.ts
git commit -m "feat(cli): add Firebase JSON validation utilities"
```

---

## Task 3: Install QR Code Dependency

**Files:**
- Modify: `cli/package.json`

**Step 1: Add qrcode-terminal dependency**

Run in the cli directory:

```bash
cd cli && pnpm add qrcode-terminal && pnpm add -D @types/qrcode-terminal
```

**Step 2: Verify package.json updated**

Ensure `qrcode-terminal` appears in dependencies.

**Step 3: Commit**

```bash
git add cli/package.json cli/pnpm-lock.yaml
git commit -m "feat(cli): add qrcode-terminal for setup QR codes"
```

---

## Task 4: Add Web Config Storage to Config Utils

**Files:**
- Modify: `cli/src/utils/config.ts`

**Step 1: Add web config constants and functions**

Add at the top after existing constants:

```typescript
const WEB_CONFIG_FILE = path.join(CONFIG_DIR, 'web-config.json');
```

Add these functions at the end of the file:

```typescript
/**
 * Load web config from file
 */
export function loadWebConfig(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(WEB_CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(WEB_CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save web config to file
 */
export function saveWebConfig(config: Record<string, unknown>): void {
  ensureConfigDir();
  fs.writeFileSync(WEB_CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Check if web config exists
 */
export function hasWebConfig(): boolean {
  return fs.existsSync(WEB_CONFIG_FILE);
}
```

**Step 2: Commit**

```bash
git add cli/src/utils/config.ts
git commit -m "feat(cli): add web config storage utilities"
```

---

## Task 5: Refactor Init Command with --from-json Flag

**Files:**
- Modify: `cli/src/commands/init.ts`

**Step 1: Replace the entire init.ts with the enhanced version**

```typescript
import * as fs from 'fs';
import * as path from 'path';
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
```

**Step 2: Commit**

```bash
git add cli/src/commands/init.ts
git commit -m "feat(cli): add --from-json flag and web config support to init"
```

---

## Task 6: Update CLI Index with Init Options

**Files:**
- Modify: `cli/src/index.ts`

**Step 1: Update the init command registration**

Find the existing init command (around line 18) and replace it with:

```typescript
program
  .command('init')
  .description('Configure ClaudeInsight with your Firebase credentials')
  .option('-f, --from-json <path>', 'Path to Firebase service account JSON file')
  .option('-w, --web-config <path>', 'Path to Firebase web SDK config JSON file')
  .action(initCommand);
```

**Step 2: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): add --from-json and --web-config flags to init command"
```

---

## Task 7: Create Link Command

**Files:**
- Create: `cli/src/commands/link.ts`

**Step 1: Create the link command**

```typescript
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
    console.log(chalk.red('\n❌ ClaudeInsight is not configured.'));
    console.log(chalk.gray('Run "claudeinsight init" first.\n'));
    return;
  }

  if (!hasWebConfig()) {
    console.log(chalk.yellow('\n⚠ No web config found.'));
    console.log(chalk.gray('\nTo generate a dashboard link, add web config:'));
    console.log(chalk.white('  claudeinsight init --web-config <path-to-config.json>\n'));
    console.log(chalk.gray('Or visit the dashboard and configure Firebase manually:'));
    console.log(chalk.white('  https://claude-insights.vercel.app\n'));
    return;
  }

  const webConfigData = loadWebConfig();
  if (!webConfigData || !validateWebConfig(webConfigData)) {
    console.log(chalk.red('\n❌ Invalid web config stored.'));
    console.log(chalk.gray('Run "claudeinsight init --web-config <path>" to reconfigure.\n'));
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
```

**Step 2: Commit**

```bash
git add cli/src/commands/link.ts
git commit -m "feat(cli): add link command for generating dashboard URLs"
```

---

## Task 8: Register Link Command

**Files:**
- Modify: `cli/src/index.ts`

**Step 1: Import the link command**

Add import at top with other command imports:

```typescript
import { linkCommand } from './commands/link.js';
```

**Step 2: Register the command**

Add after the status command registration (around line 36):

```typescript
program
  .command('link')
  .description('Generate a link to connect the web dashboard')
  .option('--no-qr', 'Skip QR code generation')
  .action(linkCommand);
```

**Step 3: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): register link command"
```

---

## Task 9: Update Status Command to Show Web Config

**Files:**
- Modify: `cli/src/commands/status.ts`

**Step 1: Read the current file to understand structure**

Read the file first to find where to add web config status.

**Step 2: Add web config status display**

Add import for `hasWebConfig` and `loadWebConfig`:

```typescript
import { loadConfig, loadSyncState, hasWebConfig, loadWebConfig } from '../utils/config.js';
```

After the Firebase configuration status section, add:

```typescript
  // Web dashboard config status
  console.log('');
  if (hasWebConfig()) {
    const webConfig = loadWebConfig();
    console.log(chalk.green('✓ Web dashboard: Configured'));
    if (webConfig && typeof webConfig.projectId === 'string') {
      console.log(chalk.gray(`  Project: ${webConfig.projectId}`));
    }
    console.log(chalk.gray('  Run "claudeinsight link" to get dashboard URL'));
  } else {
    console.log(chalk.yellow('○ Web dashboard: Not configured'));
    console.log(chalk.gray('  Run "claudeinsight init" with --web-config to add'));
  }
```

**Step 3: Commit**

```bash
git add cli/src/commands/status.ts
git commit -m "feat(cli): show web config status in status command"
```

---

## Task 10: Build and Test CLI

**Step 1: Build the CLI**

```bash
cd cli && pnpm build
```

**Step 2: Test the help output**

```bash
node dist/index.js --help
node dist/index.js init --help
node dist/index.js link --help
```

Expected: `init --help` should show `--from-json` and `--web-config` options.

**Step 3: Test status command**

```bash
node dist/index.js status
```

Should show web config status (configured or not).

**Step 4: Test link command without web config**

```bash
node dist/index.js link
```

Should show "No web config found" message.

**Step 5: Fix any compilation errors and commit**

```bash
git add -A
git commit -m "fix(cli): resolve build issues"
```

---

## Task 11: Create Firebase Setup Guide

**Files:**
- Create: `cli/docs/FIREBASE_SETUP.md`

**Step 1: Create the setup guide**

```markdown
# Firebase Setup Guide

This guide walks you through setting up Firebase for ClaudeInsight.

## Prerequisites

- A Google account
- [Firebase Console](https://console.firebase.google.com) access

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"** (or **"Add project"**)
3. Enter a project name (e.g., "claudeinsight-data")
4. Disable Google Analytics (optional, not needed)
5. Click **"Create project"**

## Step 2: Enable Firestore

1. In your Firebase project, click **"Build"** in the sidebar
2. Click **"Firestore Database"**
3. Click **"Create database"**
4. Choose **"Start in production mode"**
5. Select a location closest to you
6. Click **"Enable"**

## Step 3: Download Service Account Key

1. Click the **gear icon** next to "Project Overview"
2. Select **"Project settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"**
5. Click **"Generate key"** to download the JSON file
6. Save the file (e.g., `~/Downloads/serviceAccountKey.json`)

## Step 4: Get Web SDK Config (for Dashboard)

1. In Project Settings, go to the **"General"** tab
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., "claudeinsight-web")
5. Click **"Register app"**
6. Copy the `firebaseConfig` object and save to a JSON file:

**Example: `~/Downloads/firebase-web-config.json`**
```json
{
  "apiKey": "AIza...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123"
}
```

## Step 5: Configure ClaudeInsight CLI

### Option A: Quick Setup (Recommended)

```bash
claudeinsight init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.json
```

This will:
- Configure the CLI to sync sessions
- Generate a dashboard link with QR code

### Option B: Interactive Setup

```bash
claudeinsight init
```

Follow the prompts to provide credentials.

## Step 6: Sync Your Sessions

```bash
claudeinsight sync
```

## Step 7: Open the Dashboard

If you configured web config, a dashboard link was shown. Regenerate it anytime:

```bash
claudeinsight link
```

Or visit [claude-insights.vercel.app](https://claude-insights.vercel.app) and configure manually.

## Troubleshooting

### "Permission denied" errors

Update Firestore security rules in Firebase Console > Firestore > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Note:** This allows all access. For production, implement proper rules.

### "Invalid service account" errors

- Ensure the JSON file is unmodified from Firebase
- Check that private_key includes BEGIN/END markers

### Dashboard not connecting

- Verify web config `projectId` matches service account `project_id`
- Clear browser localStorage and try the setup link again
```

**Step 2: Commit**

```bash
git add cli/docs/FIREBASE_SETUP.md
git commit -m "docs(cli): add Firebase setup guide"
```

---

## Task 12: Update CLI README

**Files:**
- Modify: `cli/README.md`

**Step 1: Update the Quick Start and Commands sections**

Replace the Quick Start section with:

```markdown
## Quick Start

### 1. Set up Firebase
See [Firebase Setup Guide](docs/FIREBASE_SETUP.md) for detailed instructions.

### 2. Configure the CLI

**Option A: Quick Setup (Recommended)**
```bash
claudeinsight init --from-json ~/Downloads/serviceAccountKey.json
```

**Option B: With Web Dashboard Link**
```bash
claudeinsight init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.json
```

**Option C: Interactive Setup**
```bash
claudeinsight init
```

### 3. Sync your sessions
```bash
claudeinsight sync
```

### 4. Connect the Dashboard
```bash
claudeinsight link
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Configure Firebase credentials interactively |
| `init --from-json <path>` | Import service account from JSON file |
| `init --web-config <path>` | Also configure web dashboard linking |
| `sync` | Sync sessions to Firestore |
| `sync --force` | Re-sync all sessions |
| `sync --dry-run` | Preview without uploading |
| `status` | Show configuration and sync status |
| `link` | Generate dashboard connection URL/QR code |
| `install-hook` | Auto-sync on Claude Code session end |
```

**Step 2: Commit**

```bash
git add cli/README.md
git commit -m "docs(cli): update README with simplified setup"
```

---

## Task 13: Final Build and Integration Test

**Step 1: Clean build**

```bash
cd cli && rm -rf dist && pnpm build
```

**Step 2: Run full command test**

```bash
# Test all help
node dist/index.js --help
node dist/index.js init --help
node dist/index.js link --help
node dist/index.js status --help

# Test status
node dist/index.js status
```

**Step 3: Create test JSON files (optional manual test)**

Create a mock service account JSON for testing validation:

```bash
echo '{
  "type": "service_account",
  "project_id": "test-project",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
  "client_email": "test@test-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test"
}' > /tmp/test-sa.json

# Test init with JSON (will fail at Firebase connection but should parse)
node dist/index.js init --from-json /tmp/test-sa.json
```

**Step 4: Commit final state**

```bash
git add -A
git commit -m "chore(cli): final build verification for simplified setup"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add Firebase JSON types | `types.ts` |
| 2 | Add JSON validation utilities | `utils/firebase-json.ts` |
| 3 | Install qrcode-terminal | `package.json` |
| 4 | Add web config storage | `utils/config.ts` |
| 5 | Refactor init with --from-json | `commands/init.ts` |
| 6 | Update CLI index with options | `index.ts` |
| 7 | Create link command | `commands/link.ts` |
| 8 | Register link command | `index.ts` |
| 9 | Update status command | `commands/status.ts` |
| 10 | Build and test | - |
| 11 | Create setup guide | `docs/FIREBASE_SETUP.md` |
| 12 | Update README | `README.md` |
| 13 | Final integration test | - |

**Total: 13 tasks**

---

## Post-Implementation: Web App Updates (Separate Repo)

After CLI changes are complete, verify in the web app repo:

1. **URL config parsing works** - `?config=BASE64` auto-configures on load
2. **Success toast shown** - "Firebase configured from URL" message
3. **Settings page reflects** - Shows configured project after URL import

These are tracked separately in the `claudeinsight-web` repository.
