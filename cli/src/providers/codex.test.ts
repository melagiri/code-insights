import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodexProvider } from './codex.js';

// ---------------------------------------------------------------------------
// Helpers to build JSONL fixture content
// ---------------------------------------------------------------------------

function sessionMeta(id = 'test-session-1', cwd = '/home/user/myproject'): string {
  return JSON.stringify({
    type: 'session_meta',
    payload: { id, timestamp: '2026-01-01T10:00:00Z', cwd, model: 'o4-mini', cli_version: '0.104.0' },
  });
}

function userMessageLine(message: string, id = 'msg-u1'): string {
  return JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-01-01T10:01:00Z',
    payload: { type: 'user_message', id, message },
  });
}

function assistantLine(text: string): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:00Z',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  });
}

function taskCompleteLine(): string {
  return JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-01-01T10:03:00Z',
    payload: { type: 'task_complete', usage: { input_tokens: 100, output_tokens: 50 } },
  });
}

function buildJSONL(lines: string[]): string {
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexProvider — Format A system context filtering', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses a minimal valid session with one user + one assistant message', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('What is 2 + 2?'),
      assistantLine('The answer is 4.'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-test.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(1);
    expect(session!.assistantMessageCount).toBe(1);
  });

  it('filters out <permissions> system context messages', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('<permissions>read_only</permissions>'),
      userMessageLine('What is 2 + 2?'),
      assistantLine('The answer is 4.'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-permissions.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    // Only the genuine user message should be counted
    expect(session!.userMessageCount).toBe(1);
  });

  it('filters out <environment_context> system context messages', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('<environment_context>OS: Linux, shell: bash</environment_context>'),
      userMessageLine('Hello, please help me refactor this code.'),
      assistantLine('Sure! What would you like to change?'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-env-context.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(1);
  });

  it('filters out # AGENTS.md system context messages', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('# AGENTS.md\n\nThis is the agents configuration file...'),
      userMessageLine('Add a new feature to the codebase.'),
      assistantLine('I will help you add that feature.'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-agents-md.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(1);
  });

  it('filters out multiple consecutive system context messages before first real prompt', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('<permissions>read_write</permissions>'),
      userMessageLine('<environment_context>cwd: /home/user/project</environment_context>'),
      userMessageLine('## Shell\nbash 5.1'),
      userMessageLine('Now fix the bug in src/main.ts'),
      assistantLine("I'll fix that bug right away."),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-multi-system.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    // 3 system context messages filtered + 1 real user message
    expect(session!.userMessageCount).toBe(1);
  });

  it('preserves normal user messages that happen to contain XML-like text', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Can you explain the <permissions> model in OAuth 2.0?'),
      assistantLine('OAuth 2.0 uses scopes to define permissions...'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-xml-in-user-msg.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    // Message asks ABOUT permissions (not a system context injection — doesn't START with the tag)
    expect(session!.userMessageCount).toBe(1);
  });

  it('returns null when session has no real messages after system context filtering', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('<permissions>read_only</permissions>'),
      userMessageLine('<environment_context>cwd: /tmp</environment_context>'),
      // No actual user message or assistant response follows
    ]);

    const filePath = path.join(tempDir, 'rollout-only-system.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    // buildSession returns null when messages.length === 0
    expect(session).toBeNull();
  });

  it('counts messageCount as userMessageCount + assistantMessageCount', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('<environment_context>cwd: /tmp</environment_context>'),
      userMessageLine('First real question'),
      assistantLine('First answer'),
      taskCompleteLine(),
      userMessageLine('Second question'),
      assistantLine('Second answer'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-message-count.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(2);
    expect(session!.assistantMessageCount).toBe(2);
    expect(session!.messageCount).toBe(session!.userMessageCount + session!.assistantMessageCount);
  });

  it('includes compactCount, autoCompactCount, and slashCommands with zero/empty defaults', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Run the tests please'),
      assistantLine('Running tests now...'),
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-v6-fields.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.compactCount).toBe(0);
    expect(session!.autoCompactCount).toBe(0);
    expect(session!.slashCommands).toEqual([]);
  });
});
