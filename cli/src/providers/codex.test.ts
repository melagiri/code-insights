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

// v0.131+ task_complete no longer carries usage — usage lives in token_count events
function taskCompleteLineNew(): string {
  return JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-01-01T10:03:00Z',
    payload: {
      type: 'task_complete',
      turn_id: 'turn-001',
      last_agent_message: 'Done.',
      completed_at: 1746000000,
      duration_ms: 12345,
      time_to_first_token_ms: 1500,
    },
  });
}

function tokenCountLine(opts: {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
  total_tokens: number;
}): string {
  return JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-01-01T10:02:50Z',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: opts,
        last_token_usage: opts,
      },
    },
  });
}

function functionCallLine(name: string, args: Record<string, unknown>, callId: string): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:10Z',
    payload: { type: 'function_call', name, arguments: JSON.stringify(args), call_id: callId },
  });
}

function functionCallOutputLine(callId: string, output: string): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:20Z',
    payload: { type: 'function_call_output', call_id: callId, output },
  });
}

function customToolCallLine(name: string, input: string, callId: string): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:10Z',
    payload: { type: 'custom_tool_call', name, input, call_id: callId, status: 'completed' },
  });
}

function customToolCallOutputLine(callId: string, output: string): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:20Z',
    payload: { type: 'custom_tool_call_output', call_id: callId, output: JSON.stringify({ output }) },
  });
}

function reasoningLine(summaryItems: Array<{ type: string; text: string }>): string {
  return JSON.stringify({
    type: 'response_item',
    timestamp: '2026-01-01T10:02:00Z',
    payload: { type: 'reasoning', summary: summaryItems, content: null },
  });
}

function turnAbortedLine(): string {
  return JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-01-01T10:02:30Z',
    payload: { type: 'turn_aborted', turn_id: 'turn-001', reason: 'interrupted' },
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

// ---------------------------------------------------------------------------
// token_count usage capture (v0.131+ format)
// ---------------------------------------------------------------------------

describe('CodexProvider — Format A token_count usage capture', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('captures usage from token_count events when task_complete has no usage field', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Refactor this module'),
      assistantLine('I will refactor it for you.'),
      tokenCountLine({ input_tokens: 25000, cached_input_tokens: 3000, output_tokens: 500, total_tokens: 25500 }),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-token-count-usage.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    expect(session!.usage!.totalInputTokens).toBe(25000);
    expect(session!.usage!.totalOutputTokens).toBe(500);
    expect(session!.usage!.cacheReadTokens).toBe(3000);
  });

  it('uses the last token_count event (cumulative total) when multiple are emitted', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Write some code'),
      assistantLine('Here is the code.'),
      // First token_count (after first API call)
      tokenCountLine({ input_tokens: 1000, output_tokens: 100, total_tokens: 1100 }),
      // Second token_count (cumulative after second API call)
      tokenCountLine({ input_tokens: 5000, output_tokens: 400, total_tokens: 5400 }),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-multi-token-count.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    // Should use the LAST (most cumulative) token_count
    expect(session!.usage!.totalInputTokens).toBe(5000);
    expect(session!.usage!.totalOutputTokens).toBe(400);
  });

  it('still captures usage from old-format task_complete.usage when present', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Explain this code'),
      assistantLine('This code does X.'),
      // Old-format task_complete with inline usage
      taskCompleteLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-old-task-complete.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    expect(session!.usage!.totalInputTokens).toBe(100);
    expect(session!.usage!.totalOutputTokens).toBe(50);
  });

  it('returns undefined usage when token counts are all zero', async () => {
    // External-import sessions replay with zero token counts
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Do something'),
      assistantLine('Done.'),
      tokenCountLine({ input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 }),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-zero-usage.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.usage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tool call parsing
// ---------------------------------------------------------------------------

describe('CodexProvider — Format A tool call parsing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses function_call and function_call_output events into toolCallCount', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('List the files'),
      functionCallLine('exec_command', { cmd: 'ls -la' }, 'call-1'),
      functionCallOutputLine('call-1', 'file1.ts\nfile2.ts'),
      assistantLine('I found two files.'),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-function-calls.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.toolCallCount).toBe(1);
    expect(session!.userMessageCount).toBe(1);
    expect(session!.assistantMessageCount).toBe(1);
  });

  it('counts multiple parallel function_calls correctly', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Read three files'),
      functionCallLine('exec_command', { cmd: 'cat a.ts' }, 'call-a'),
      functionCallLine('exec_command', { cmd: 'cat b.ts' }, 'call-b'),
      functionCallLine('exec_command', { cmd: 'cat c.ts' }, 'call-c'),
      functionCallOutputLine('call-a', 'content a'),
      functionCallOutputLine('call-b', 'content b'),
      functionCallOutputLine('call-c', 'content c'),
      assistantLine('I read all three files.'),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-parallel-calls.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.toolCallCount).toBe(3);
  });

  it('parses custom_tool_call (apply_patch) events', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Fix the bug in main.ts'),
      functionCallLine('exec_command', { cmd: 'cat main.ts' }, 'call-read'),
      functionCallOutputLine('call-read', 'const x = 1;'),
      customToolCallLine('apply_patch', '*** Begin Patch\n*** End Patch', 'call-patch'),
      customToolCallOutputLine('call-patch', 'Applied successfully'),
      assistantLine('I fixed the bug.'),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-custom-tool.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.toolCallCount).toBe(2); // exec_command + apply_patch
  });
});

// ---------------------------------------------------------------------------
// Aborted and interrupted sessions (turn_aborted replaces task_complete)
// ---------------------------------------------------------------------------

describe('CodexProvider — Format A aborted sessions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('still produces a valid session when turn_aborted replaces task_complete', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Do a long task'),
      functionCallLine('exec_command', { cmd: 'sleep 60' }, 'call-long'),
      // User interrupted — no task_complete
      turnAbortedLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-aborted.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(1);
    // Assistant turn flushed at end even without task_complete
    expect(session!.assistantMessageCount).toBe(1);
    expect(session!.toolCallCount).toBe(1);
  });

  it('captures token_count usage even when turn was aborted before task_complete', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Analyze this codebase'),
      functionCallLine('exec_command', { cmd: 'find . -name "*.ts"' }, 'call-find'),
      functionCallOutputLine('call-find', 'src/index.ts\nsrc/utils.ts'),
      tokenCountLine({ input_tokens: 8000, output_tokens: 200, total_tokens: 8200 }),
      turnAbortedLine(),
    ]);

    const filePath = path.join(tempDir, 'rollout-aborted-with-usage.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.usage).toBeDefined();
    expect(session!.usage!.totalInputTokens).toBe(8000);
    expect(session!.usage!.totalOutputTokens).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Reasoning events
// ---------------------------------------------------------------------------

describe('CodexProvider — Format A reasoning events', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts thinking text from reasoning summary_text items', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Solve this problem'),
      reasoningLine([{ type: 'summary_text', text: 'The user wants X, so I should do Y.' }]),
      assistantLine('Here is the solution.'),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-reasoning-text.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    const assistantMsg = session!.messages.find(m => m.type === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.thinking).toContain('The user wants X');
  });

  it('handles empty reasoning summary (encrypted reasoning in v0.131+) without error', async () => {
    const content = buildJSONL([
      sessionMeta(),
      userMessageLine('Solve a hard problem'),
      reasoningLine([]), // empty summary — reasoning is encrypted
      assistantLine('Here is the answer.'),
      taskCompleteLineNew(),
    ]);

    const filePath = path.join(tempDir, 'rollout-encrypted-reasoning.jsonl');
    fs.writeFileSync(filePath, content);

    const provider = new CodexProvider();
    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.userMessageCount).toBe(1);
    expect(session!.assistantMessageCount).toBe(1);
    const assistantMsg = session!.messages.find(m => m.type === 'assistant');
    // thinking is null when summary is empty
    expect(assistantMsg!.thinking).toBeNull();
  });
});
