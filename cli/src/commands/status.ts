import chalk from 'chalk';
import { loadConfig, loadSyncState, isConfigured, getConfigDir, getClaudeDir, hasWebConfig, loadWebConfig, resolveDataSourcePreference } from '../utils/config.js';
import { initializeFirebase, getProjects } from '../firebase/client.js';
import { trackEvent } from '../utils/telemetry.js';
import * as fs from 'fs';

/**
 * Show Code Insights status
 */
export async function statusCommand(): Promise<void> {
  console.log(chalk.cyan('\n📊 Code Insights Status\n'));

  // Check configuration
  console.log(chalk.white('Configuration:'));
  const preference = resolveDataSourcePreference();
  if (isConfigured()) {
    console.log(chalk.green(`  ✓ Configured at ${getConfigDir()}`));
    const config = loadConfig();
    if (config) {
      console.log(chalk.gray(`    Project: ${config.firebase?.projectId ?? '(local)'}`));
    }
    console.log(chalk.gray(`    Data source: ${preference}`));
  } else {
    console.log(chalk.yellow('  ○ Not configured (running in zero-config mode)'));
    console.log(chalk.gray('    Stats work without config: code-insights stats'));
    console.log(chalk.gray('    To configure Firebase: code-insights init'));
  }

  // Check Claude directory
  console.log(chalk.white('\nClaude Code:'));
  const claudeDir = getClaudeDir();
  if (fs.existsSync(claudeDir)) {
    const projectDirs = fs.readdirSync(claudeDir).filter((d) => !d.startsWith('.'));
    const sessionCount = countJsonlFiles(claudeDir);
    console.log(chalk.green(`  ✓ Found at ${claudeDir}`));
    console.log(chalk.gray(`    ${projectDirs.length} projects, ${sessionCount} sessions`));
  } else {
    console.log(chalk.yellow(`  ⚠ Not found at ${claudeDir}`));
  }

  // Check sync state
  console.log(chalk.white('\nSync State:'));
  const syncState = loadSyncState();
  if (syncState.lastSync) {
    const lastSync = new Date(syncState.lastSync);
    const syncedFiles = Object.keys(syncState.files).length;
    console.log(chalk.green(`  ✓ Last sync: ${lastSync.toLocaleString()}`));
    console.log(chalk.gray(`    ${syncedFiles} files tracked`));
  } else {
    console.log(chalk.yellow('  ⚠ Never synced'));
    console.log(chalk.gray('    Run `code-insights sync` to sync'));
  }

  if (preference === 'local') {
    // Local mode — skip Firebase connection check
    console.log(chalk.white('\nFirebase:'));
    console.log(chalk.gray('  ○ Not applicable (data source is local)'));
    console.log(chalk.gray('    Use `code-insights stats --local` for session analytics'));
    console.log(chalk.gray('    To switch: code-insights config set-source firebase'));
  } else {
    // Check Firebase connection
    console.log(chalk.white('\nFirebase:'));
    const config = loadConfig();
    if (config) {
      try {
        initializeFirebase(config);
        const projects = await getProjects();
        console.log(chalk.green('  ✓ Connected'));
        console.log(chalk.gray(`    ${projects.length} projects in Firestore`));

        if (projects.length > 0) {
          console.log(chalk.white('\nSynced Projects:'));
          for (const project of projects.slice(0, 5)) {
            console.log(chalk.gray(`    ${project.name} (${project.sessionCount} sessions)`));
          }
          if (projects.length > 5) {
            console.log(chalk.gray(`    ... and ${projects.length - 5} more`));
          }
        }
      } catch (error) {
        console.log(chalk.red('  ✗ Connection failed'));
        console.log(chalk.gray(`    ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }

    // Check web dashboard config
    console.log(chalk.white('\nWeb Dashboard:'));
    if (hasWebConfig()) {
      const webConfig = loadWebConfig();
      console.log(chalk.green('  ✓ Configured'));
      if (webConfig && typeof webConfig.projectId === 'string') {
        console.log(chalk.gray(`    Project: ${webConfig.projectId}`));
      }
      console.log(chalk.gray('    Run "code-insights connect" to get dashboard URL'));
    } else {
      console.log(chalk.yellow('  ○ Not configured'));
      console.log(chalk.gray('    Run "code-insights init" to configure'));
    }
  }

  console.log('');
  trackEvent('status', true);
}

/**
 * Count JSONL files in Claude directory
 */
function countJsonlFiles(baseDir: string): number {
  let count = 0;
  const dirs = fs.readdirSync(baseDir);

  for (const dir of dirs) {
    if (dir.startsWith('.')) continue;
    const projectPath = `${baseDir}/${dir}`;
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(projectPath);
    count += files.filter((f) => f.endsWith('.jsonl')).length;
  }

  return count;
}
