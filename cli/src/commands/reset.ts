import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import admin from 'firebase-admin';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../utils/config.js';

const SYNC_STATE_FILE = join(process.env.HOME || '~', '.code-insights', 'sync-state.json');

export const resetCommand = new Command('reset')
  .description('Delete all data from Firestore and reset local sync state')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async (options) => {
    console.log(chalk.red.bold('\n⚠️  WARNING: This will permanently delete ALL data from your Firestore database!'));
    console.log(chalk.yellow('Collections to be deleted: projects, sessions, insights, messages\n'));

    if (!options.confirm) {
      // Simple confirmation using stdin
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan('Type "DELETE" to confirm: '), resolve);
      });
      rl.close();

      if (answer !== 'DELETE') {
        console.log(chalk.gray('\nAborted. No data was deleted.'));
        process.exit(0);
      }
    }

    // Load config
    const config = loadConfig();
    if (!config) {
      console.error(chalk.red('Error: Not configured. Run `code-insights init` first.'));
      process.exit(1);
    }

    // Initialize Firebase
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }

    const db = admin.firestore();
    const collections = ['projects', 'sessions', 'insights', 'messages'];

    console.log('');

    for (const collectionName of collections) {
      const spinner = ora(`Deleting ${collectionName}...`).start();

      try {
        const deleted = await deleteCollection(db, collectionName);
        spinner.succeed(`Deleted ${deleted} documents from ${collectionName}`);
      } catch (error) {
        spinner.fail(`Failed to delete ${collectionName}: ${error}`);
      }
    }

    // Delete local sync state
    const syncSpinner = ora('Removing local sync state...').start();
    try {
      if (existsSync(SYNC_STATE_FILE)) {
        unlinkSync(SYNC_STATE_FILE);
        syncSpinner.succeed('Removed local sync state');
      } else {
        syncSpinner.info('No local sync state file found');
      }
    } catch (error) {
      syncSpinner.fail(`Failed to remove sync state: ${error}`);
    }

    console.log(chalk.green('\n✓ Reset complete. Run `code-insights sync` to re-sync all sessions.\n'));
    process.exit(0);
  });

async function deleteCollection(db: admin.firestore.Firestore, collectionName: string): Promise<number> {
  const collectionRef = db.collection(collectionName);
  const batchSize = 500;
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;
  }

  return totalDeleted;
}
