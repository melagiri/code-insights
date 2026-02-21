import * as fs from 'fs';
import * as path from 'path';
import type { SessionProvider } from './types.js';
import type { ParsedSession } from '../types.js';
import { parseJsonlFile } from '../parser/jsonl.js';
import { getClaudeDir } from '../utils/config.js';

/**
 * Claude Code session provider.
 * Discovers and parses JSONL session files from ~/.claude/projects/
 */
export class ClaudeCodeProvider implements SessionProvider {
  getProviderName(): string {
    return 'claude-code';
  }

  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const baseDir = getClaudeDir();

    if (!fs.existsSync(baseDir)) {
      return [];
    }

    return discoverJsonlFiles(baseDir, options?.projectFilter);
  }

  async parse(filePath: string): Promise<ParsedSession | null> {
    const session = await parseJsonlFile(filePath);
    if (session) {
      session.sourceTool = 'claude-code';
    }
    return session;
  }
}

/**
 * Discover all JSONL files in Claude directory
 */
function discoverJsonlFiles(baseDir: string, projectFilter?: string): string[] {
  const files: string[] = [];

  const projectDirs = fs.readdirSync(baseDir);
  for (const projectDir of projectDirs) {
    // Skip hidden files and non-directories
    if (projectDir.startsWith('.')) continue;

    const projectPath = path.join(baseDir, projectDir);
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) continue;

    // Apply project filter if specified
    if (projectFilter && !projectDir.toLowerCase().includes(projectFilter.toLowerCase())) {
      continue;
    }

    // Find JSONL files in project directory
    const projectFiles = fs.readdirSync(projectPath);
    for (const file of projectFiles) {
      if (file.endsWith('.jsonl')) {
        files.push(path.join(projectPath, file));
      }
    }

    // Also check subagents directory
    const subagentsDir = path.join(projectPath, 'subagents');
    if (fs.existsSync(subagentsDir)) {
      const subagentFiles = fs.readdirSync(subagentsDir);
      for (const file of subagentFiles) {
        if (file.endsWith('.jsonl')) {
          files.push(path.join(subagentsDir, file));
        }
      }
    }
  }

  return files;
}
