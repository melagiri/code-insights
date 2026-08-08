import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PiProvider } from './pi.js';

function line(value: unknown): string {
  return JSON.stringify(value);
}

function header(id = 'session-1', cwd = '/home/user/project'): string {
  return line({
    type: 'session',
    version: 3,
    id,
    timestamp: '2026-04-01T10:00:00.000Z',
    cwd,
  });
}

function user(content: unknown, id = 'user-1'): string {
  return line({
    type: 'message',
    id,
    parentId: null,
    timestamp: '2026-04-01T10:01:00.000Z',
    message: { role: 'user', content, timestamp: 1_775_037_660_000 },
  });
}

function assistant(id = 'assistant-1'): string {
  return line({
    type: 'message',
    id,
    parentId: 'user-1',
    timestamp: '2026-04-01T10:02:00.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'I should inspect the file.' },
        { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'src/main.ts' } },
        { type: 'text', text: 'I inspected the file.' },
      ],
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      usage: {
        input: 100,
        output: 50,
        cacheRead: 25,
        cacheWrite: 10,
        totalTokens: 185,
        cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0.0002, total: 0.0033 },
      },
      stopReason: 'toolUse',
      timestamp: 1_775_037_720_000,
    },
  });
}

function toolResult(): string {
  return line({
    type: 'message',
    id: 'result-1',
    parentId: 'assistant-1',
    timestamp: '2026-04-01T10:03:00.000Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'read',
      content: [{ type: 'text', text: 'file contents' }],
      isError: false,
      timestamp: 1_775_037_780_000,
    },
  });
}

describe('PiProvider', () => {
  let tempDir: string;
  let previousSessionDir: string | undefined;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-provider-test-'));
    previousSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR;
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    delete process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_SESSION_DIR = tempDir;
  });

  afterEach(() => {
    if (previousSessionDir === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
    else process.env.PI_CODING_AGENT_SESSION_DIR = previousSessionDir;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('discovers nested Pi JSONL sessions and filters by header cwd', async () => {
    const nested = path.join(tempDir, '--home-user-project--');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'session.jsonl'), [header(), user('Fix the bug')].join('\n'));
    fs.writeFileSync(path.join(nested, 'ignore.txt'), 'not a session');

    const provider = new PiProvider();
    expect(provider.getProviderName()).toBe('pi');
    expect(await provider.discover()).toHaveLength(1);
    expect(await provider.discover({ projectFilter: 'PROJECT' })).toHaveLength(1);
    expect(await provider.discover({ projectFilter: 'different' })).toHaveLength(0);
  });

  it('honors PI_CODING_AGENT_DIR when the session directory override is absent', async () => {
    delete process.env.PI_CODING_AGENT_SESSION_DIR;
    process.env.PI_CODING_AGENT_DIR = tempDir;
    const sessionsDir = path.join(tempDir, 'sessions', '--project--');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'session.jsonl'), [header(), user('Fix the bug')].join('\n'));

    expect(await new PiProvider().discover()).toHaveLength(1);
  });

  it('normalizes prompts, assistant content, tool calls, results, thinking, and exact Pi usage', async () => {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, [header(), user('Fix the bug'), assistant(), toolResult()].join('\n'));

    const session = await new PiProvider().parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.id).toBe('pi:session-1');
    expect(session!.sourceTool).toBe('pi');
    expect(session!.messages[0].id).toBe('pi:session-1:user-1');
    expect(session!.messages[1].parentId).toBe('pi:session-1:user-1');
    expect(session!.projectPath).toBe('/home/user/project');
    expect(session!.userMessageCount).toBe(1);
    expect(session!.assistantMessageCount).toBe(1);
    expect(session!.messageCount).toBe(2);
    expect(session!.toolCallCount).toBe(1);
    expect(session!.messages[1].thinking).toBe('I should inspect the file.');
    expect(session!.messages[1].toolCalls[0]).toEqual({
      id: 'call-1',
      name: 'read',
      input: { path: 'src/main.ts' },
    });
    expect(session!.messages[1].toolResults[0]).toEqual({
      toolUseId: 'call-1',
      output: 'file contents',
    });
    expect(session!.usage).toMatchObject({
      totalInputTokens: 100,
      totalOutputTokens: 50,
      cacheReadTokens: 25,
      cacheCreationTokens: 10,
      estimatedCostUsd: 0.0033,
      primaryModel: 'claude-sonnet-4-6',
    });
  });

  it('deduplicates entries copied from a parent session when Pi forks', async () => {
    const parentPath = path.join(tempDir, 'parent.jsonl');
    fs.writeFileSync(parentPath, [header('parent'), user('Original request'), assistant()].join('\n'));

    const childPath = path.join(tempDir, 'child.jsonl');
    const childHeader = line({
      type: 'session',
      version: 3,
      id: 'child',
      timestamp: '2026-04-01T11:00:00.000Z',
      cwd: '/home/user/project',
      parentSession: parentPath,
    });
    const newUser = line({
      type: 'message',
      id: 'user-2',
      parentId: 'assistant-1',
      timestamp: '2026-04-01T11:01:00.000Z',
      message: { role: 'user', content: 'Try a different approach', timestamp: 1_775_041_260_000 },
    });
    fs.writeFileSync(childPath, [childHeader, user('Original request'), assistant(), newUser].join('\n'));

    const session = await new PiProvider().parse(childPath);

    expect(session!.userMessageCount).toBe(1);
    expect(session!.assistantMessageCount).toBe(0);
    expect(session!.messages[0].content).toBe('Try a different approach');
    expect(session!.messages[0].id).toBe('pi:child:user-2');
  });

  it('counts compactions once and uses a Pi session name as the title', async () => {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, [
      header(),
      user('Fix the bug'),
      line({
        type: 'compaction',
        id: 'compact-1',
        parentId: 'user-1',
        timestamp: '2026-04-01T10:02:00Z',
        summary: 'summary',
        usage: { input: 20, output: 5, cacheRead: 2, cacheWrite: 1, cost: { total: 0.0004 } },
      }),
      line({ type: 'session_info', id: 'info-1', parentId: 'compact-1', timestamp: '2026-04-01T10:03:00Z', name: 'Auth cleanup' }),
    ].join('\n'));

    const session = await new PiProvider().parse(filePath);

    expect(session!.compactCount).toBe(1);
    expect(session!.autoCompactCount).toBe(0);
    expect(session!.generatedTitle).toBe('Auth cleanup');
    expect(session!.usage).toMatchObject({
      totalInputTokens: 20,
      totalOutputTokens: 5,
      cacheReadTokens: 2,
      cacheCreationTokens: 1,
      estimatedCostUsd: 0.0004,
    });
  });

  it('preserves assistant errors as outcome signals', async () => {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, [
      header(),
      user('Fix the bug'),
      line({
        type: 'message',
        id: 'assistant-error',
        parentId: 'user-1',
        timestamp: '2026-04-01T10:02:00Z',
        message: {
          role: 'assistant',
          content: [],
          model: 'test-model',
          usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
          stopReason: 'error',
          errorMessage: 'Provider request failed',
        },
      }),
    ].join('\n'));

    const session = await new PiProvider().parse(filePath);

    expect(session!.assistantMessageCount).toBe(1);
    expect(session!.messages[1].content).toBe('[error] Provider request failed');
  });

  it('keeps image-only user turns without storing base64 image data', async () => {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, [
      header(),
      user([{ type: 'image', data: 'sensitive-base64', mimeType: 'image/png' }]),
    ].join('\n'));

    const session = await new PiProvider().parse(filePath);

    expect(session!.userMessageCount).toBe(1);
    expect(session!.messages[0].content).toBe('[Image]');
  });

  it('returns null for malformed or empty sessions', async () => {
    const malformed = path.join(tempDir, 'malformed.jsonl');
    fs.writeFileSync(malformed, 'not json');
    expect(await new PiProvider().parse(malformed)).toBeNull();

    const empty = path.join(tempDir, 'empty.jsonl');
    fs.writeFileSync(empty, header());
    expect(await new PiProvider().parse(empty)).toBeNull();
  });
});
