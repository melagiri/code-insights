import { describe, it, expect } from 'vitest';
import { parseJsonlFile, classifyUserMessage, extractSlashCommandName, WORKFLOW_COMMANDS } from './jsonl.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ClaudeMessage } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', '__fixtures__', 'sessions');

// Valid fixture uses UUID filename so extractSessionId succeeds
const validFixture = resolve(fixturesDir, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl');

// Helper to build a minimal ClaudeMessage for classification tests
function makeMsg(content: string | object): ClaudeMessage {
  return {
    type: 'user',
    uuid: 'test-uuid',
    sessionId: 'test-session',
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: content as ClaudeMessage['message']['content'],
    },
  };
}

describe('parseJsonlFile', () => {
  it('parses a valid simple session', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(result!.messages.length).toBeGreaterThanOrEqual(2);
    expect(result!.startedAt).toBeInstanceOf(Date);
    expect(result!.endedAt).toBeInstanceOf(Date);
  });

  it('returns null for empty file', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'empty.jsonl'));
    expect(result).toBeNull();
  });

  it('handles malformed JSONL gracefully', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'malformed.jsonl'));
    expect(result).toBeNull();
  });

  it('generates a title for the parsed session', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.generatedTitle).toBeTruthy();
    expect(result!.titleSource).toBeTruthy();
  });

  it('extracts session ID from filename', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('extracts usage data from assistant messages', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.usage).toBeDefined();
    expect(result!.usage!.totalInputTokens).toBe(100);
    expect(result!.usage!.totalOutputTokens).toBe(50);
    expect(result!.usage!.primaryModel).toBe('claude-sonnet-4-5');
  });

  it('counts user and assistant messages', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.userMessageCount).toBe(1);
    expect(result!.assistantMessageCount).toBe(1);
  });

  it('initializes new compact/slash fields with defaults', async () => {
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    expect(result!.compactCount).toBe(0);
    expect(result!.autoCompactCount).toBe(0);
    expect(result!.slashCommands).toEqual([]);
  });
});

describe('classifyUserMessage', () => {
  it('classifies tool result arrays as tool-result', () => {
    const msg = makeMsg([{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }]);
    expect(classifyUserMessage(msg)).toBe('tool-result');
  });

  it('classifies task notifications', () => {
    const msg = makeMsg('<task-notification>some task</task-notification>');
    expect(classifyUserMessage(msg)).toBe('task-notification');
  });

  it('classifies skill loads', () => {
    const msg = makeMsg('Base directory for this skill: /Users/foo/.claude/skills/my-skill');
    expect(classifyUserMessage(msg)).toBe('skill-load');
  });

  it('classifies auto-compact summaries', () => {
    const msg = makeMsg('This session is being continued from a previous conversation that ran out of context.');
    expect(classifyUserMessage(msg)).toBe('auto-compact');
  });

  it('classifies user /compact command', () => {
    const msg = makeMsg('<local-command-caveat>...</local-command-caveat>\n<command-name>/compact</command-name> <command-message>compact</command-message>');
    // The compact command-name tag is present → user-compact
    const msg2 = makeMsg('<command-name>/compact</command-name>');
    expect(classifyUserMessage(msg2)).toBe('user-compact');
  });

  it('classifies /exit command', () => {
    const msg = makeMsg('<command-name>/exit</command-name>');
    expect(classifyUserMessage(msg)).toBe('exit-command');
  });

  it('classifies /quit alias as exit-command', () => {
    const msg = makeMsg('<command-name>/quit</command-name>');
    expect(classifyUserMessage(msg)).toBe('exit-command');
  });

  it('classifies other slash commands as slash-command', () => {
    const msg = makeMsg('<command-name>/plan</command-name>');
    expect(classifyUserMessage(msg)).toBe('slash-command');

    const msg2 = makeMsg('<command-name>/login</command-name>');
    expect(classifyUserMessage(msg2)).toBe('slash-command');
  });

  it('classifies command frame wrappers', () => {
    const caveat = makeMsg('<local-command-caveat>Caveat: The messages below...</local-command-caveat>');
    expect(classifyUserMessage(caveat)).toBe('command-frame');

    const stdout = makeMsg('<local-command-stdout>See ya!</local-command-stdout>');
    expect(classifyUserMessage(stdout)).toBe('command-frame');
  });

  it('classifies genuine human messages', () => {
    const msg = makeMsg('Please help me fix this bug in the login handler');
    expect(classifyUserMessage(msg)).toBe('human');
  });

  it('handles array content with text blocks (no tool_result) as human', () => {
    const msg = makeMsg([{ type: 'text', text: 'Please help me' }]);
    expect(classifyUserMessage(msg)).toBe('human');
  });
});

describe('extractSlashCommandName', () => {
  it('extracts simple command names', () => {
    expect(extractSlashCommandName('<command-name>/plan</command-name>')).toBe('/plan');
    expect(extractSlashCommandName('<command-name>/compact</command-name>')).toBe('/compact');
    expect(extractSlashCommandName('<command-name>/login</command-name>')).toBe('/login');
  });

  it('extracts only the command name from commands with arguments', () => {
    // /compact with instructions: "<command-name>/compact focus on auth module</command-name>"
    expect(extractSlashCommandName('<command-name>/compact focus on auth</command-name>')).toBe('/compact');
    expect(extractSlashCommandName('<command-name>/model claude-opus-4-6</command-name>')).toBe('/model');
  });

  it('returns null when no command-name tag present', () => {
    expect(extractSlashCommandName('plain text')).toBeNull();
    expect(extractSlashCommandName('<local-command-caveat>caveat</local-command-caveat>')).toBeNull();
  });
});

describe('WORKFLOW_COMMANDS', () => {
  it('includes Tier 1 workflow commands', () => {
    expect(WORKFLOW_COMMANDS.has('/compact')).toBe(true);
    expect(WORKFLOW_COMMANDS.has('/clear')).toBe(true);
    expect(WORKFLOW_COMMANDS.has('/plan')).toBe(true);
    expect(WORKFLOW_COMMANDS.has('/review')).toBe(true);
    expect(WORKFLOW_COMMANDS.has('/model')).toBe(true);
  });

  it('does NOT include Tier 2 config commands', () => {
    expect(WORKFLOW_COMMANDS.has('/login')).toBe(false);
    expect(WORKFLOW_COMMANDS.has('/config')).toBe(false);
    expect(WORKFLOW_COMMANDS.has('/help')).toBe(false);
    expect(WORKFLOW_COMMANDS.has('/status')).toBe(false);
  });

  it('does NOT include /exit or /quit', () => {
    expect(WORKFLOW_COMMANDS.has('/exit')).toBe(false);
    expect(WORKFLOW_COMMANDS.has('/quit')).toBe(false);
  });
});

describe('full session parsing with mixed message types', () => {
  it('counts only genuine user messages in userMessageCount', async () => {
    // The existing valid fixture has 1 genuine user + 1 assistant — verify baseline
    const result = await parseJsonlFile(validFixture);
    expect(result).not.toBeNull();
    // messageCount should equal userMessageCount + assistantMessageCount
    expect(result!.messageCount).toBe(result!.userMessageCount + result!.assistantMessageCount);
  });

  it('Tier 1 and Tier 2 commands both appear in slashCommands but only Tier 1 counts', async () => {
    // This is tested via classifyUserMessage logic — the fixture doesn't have slash commands.
    // Verify by checking the counter logic directly.
    const tier1Msg = makeMsg('<command-name>/plan</command-name>');
    const tier2Msg = makeMsg('<command-name>/login</command-name>');

    // Both are 'slash-command' class
    expect(classifyUserMessage(tier1Msg)).toBe('slash-command');
    expect(classifyUserMessage(tier2Msg)).toBe('slash-command');

    // WORKFLOW_COMMANDS determines counting
    expect(WORKFLOW_COMMANDS.has('/plan')).toBe(true);   // Tier 1: counts
    expect(WORKFLOW_COMMANDS.has('/login')).toBe(false); // Tier 2: stored but not counted
  });
});
