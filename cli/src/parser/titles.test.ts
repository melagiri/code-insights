import { describe, it, expect } from 'vitest';
import { generateTitle, detectSessionCharacter, cleanTitle } from './titles.js';
import type { ParsedMessage, ParsedSession } from '../types.js';

// ── Helper Factories ──

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    type: 'user',
    content: '',
    thinking: null,
    toolCalls: [],
    toolResults: [],
    usage: null,
    timestamp: new Date('2026-01-15T10:00:00Z'),
    parentId: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: 'session-1',
    projectPath: '/path/to/project',
    projectName: 'test-project',
    summary: null,
    generatedTitle: null,
    titleSource: null,
    sessionCharacter: null,
    startedAt: new Date('2026-01-15T10:00:00Z'),
    endedAt: new Date('2026-01-15T11:00:00Z'),
    messageCount: 5,
    userMessageCount: 3,
    assistantMessageCount: 2,
    toolCallCount: 2,
    compactCount: 0,
    autoCompactCount: 0,
    slashCommands: [],
    gitBranch: null,
    claudeVersion: null,
    messages: [],
    ...overrides,
  };
}

// ── cleanTitle ──

describe('cleanTitle', () => {
  it('strips prefixes like "help me", "can you", "please"', () => {
    expect(cleanTitle('help me fix the login bug')).toBe('Fix the login bug');
    expect(cleanTitle('can you update the readme')).toBe('Update the readme');
    expect(cleanTitle('please add a new feature')).toBe('Add a new feature');
  });

  it('strips greeting prefixes', () => {
    expect(cleanTitle('hi, fix the bug')).toBe('Fix the bug');
    expect(cleanTitle('hello fix the bug')).toBe('Fix the bug');
    expect(cleanTitle('hey, can you help')).toBe('Can you help');
  });

  it('strips markdown characters (* _ ` #)', () => {
    expect(cleanTitle('**bold** title')).toBe('Bold title');
    expect(cleanTitle('`code` title')).toBe('Code title');
    expect(cleanTitle('## heading')).toBe('Heading');
  });

  it('truncates to 60 characters with ellipsis', () => {
    const longTitle = 'A'.repeat(70);
    const result = cleanTitle(longTitle);
    expect(result.length).toBe(60);
    expect(result.endsWith('...')).toBe(true);
  });

  it('does not truncate titles at 60 characters or under', () => {
    const exactTitle = 'A'.repeat(60);
    expect(cleanTitle(exactTitle)).toBe(exactTitle);
  });

  it('capitalizes the first letter', () => {
    expect(cleanTitle('fix the bug')).toBe('Fix the bug');
  });

  it('collapses multiple whitespace into single space', () => {
    expect(cleanTitle('fix   the    bug')).toBe('Fix the bug');
  });

  it('trims leading/trailing whitespace', () => {
    expect(cleanTitle('  fix the bug  ')).toBe('Fix the bug');
  });
});

// ── detectSessionCharacter ──

describe('detectSessionCharacter', () => {
  it('returns null for empty messages', () => {
    const session = makeSession({ messages: [], messageCount: 0, toolCallCount: 0 });
    expect(detectSessionCharacter(session)).toBeNull();
  });

  it('detects quick_task for short sessions with edits', () => {
    const messages = [
      makeMessage({
        type: 'user',
        content: 'fix the typo in readme',
      }),
      makeMessage({
        type: 'assistant',
        content: 'Done',
        toolCalls: [
          { id: 'tc-1', name: 'Edit', input: { file_path: '/readme.md' } },
        ],
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 5,  // <10
      toolCallCount: 1,
    });
    expect(detectSessionCharacter(session)).toBe('quick_task');
  });

  it('detects learning for 3+ user questions with low tool usage', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'What is a closure?' }),
      makeMessage({ type: 'assistant', content: 'A closure is...' }),
      makeMessage({ type: 'user', content: 'How does it work?' }),
      makeMessage({ type: 'assistant', content: 'It works by...' }),
      makeMessage({ type: 'user', content: 'Why use closures?' }),
      makeMessage({ type: 'assistant', content: 'Because...' }),
    ];
    const session = makeSession({
      messages,
      messageCount: 20,  // enough to not be quick_task
      toolCallCount: 5,  // < messageCount
    });
    expect(detectSessionCharacter(session)).toBe('learning');
  });

  it('detects feature_build when 3+ files are created', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Creating files',
        toolCalls: [
          { id: 'tc-1', name: 'Write', input: { file_path: '/a.ts' } },
          { id: 'tc-2', name: 'Write', input: { file_path: '/b.ts' } },
          { id: 'tc-3', name: 'Write', input: { file_path: '/c.ts' } },
        ],
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 20,
      toolCallCount: 3,
    });
    expect(detectSessionCharacter(session)).toBe('feature_build');
  });

  it('detects bug_hunt when error patterns + fix + edits present', () => {
    const messages = [
      makeMessage({
        type: 'user',
        content: 'There is an error in the login flow',
      }),
      makeMessage({
        type: 'assistant',
        content: 'I fixed the issue, it is working now',
        toolCalls: [
          { id: 'tc-1', name: 'Edit', input: { file_path: '/login.ts' } },
        ],
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 20,
      toolCallCount: 1,
    });
    expect(detectSessionCharacter(session)).toBe('bug_hunt');
  });

  it('detects deep_focus for 50+ messages with few files modified', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Editing file',
        toolCalls: [
          { id: 'tc-1', name: 'Edit', input: { file_path: '/main.ts' } },
        ],
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 50,
      toolCallCount: 1,
    });
    expect(detectSessionCharacter(session)).toBe('deep_focus');
  });

  it('detects exploration for heavy reads with few edits', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Reading files',
        toolCalls: [
          { id: 'tc-1', name: 'Read', input: {} },
          { id: 'tc-2', name: 'Grep', input: {} },
          { id: 'tc-3', name: 'Glob', input: {} },
          { id: 'tc-4', name: 'Read', input: {} },
          { id: 'tc-5', name: 'Read', input: {} },
          { id: 'tc-6', name: 'Read', input: {} },
          { id: 'tc-7', name: 'Read', input: {} },
          { id: 'tc-8', name: 'Read', input: {} },
          { id: 'tc-9', name: 'Read', input: {} },
          { id: 'tc-10', name: 'Read', input: {} },
          { id: 'tc-11', name: 'Read', input: {} },
          { id: 'tc-12', name: 'Read', input: {} },
          { id: 'tc-13', name: 'Read', input: {} },
        ],
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 20,
      toolCallCount: 13,
    });
    expect(detectSessionCharacter(session)).toBe('exploration');
  });

  it('detects refactor for many edits with no new files', () => {
    const toolCalls = Array.from({ length: 11 }, (_, i) => ({
      id: `tc-${i}`,
      name: 'Edit',
      input: { file_path: `/file-${i % 3}.ts` },
    }));
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Refactoring',
        toolCalls,
      }),
    ];
    const session = makeSession({
      messages,
      messageCount: 20,
      toolCallCount: 11,
    });
    expect(detectSessionCharacter(session)).toBe('refactor');
  });
});

// ── generateTitle ──

describe('generateTitle', () => {
  it('uses claude summary when available', () => {
    const session = makeSession({
      summary: 'Fixed authentication bug in login flow',
    });
    const result = generateTitle(session);
    expect(result.title).toBe('Fixed authentication bug in login flow');
    expect(result.source).toBe('claude');
  });

  it('falls back to user message', () => {
    const messages = [
      makeMessage({
        type: 'user',
        content: 'Add dark mode toggle to the settings page',
      }),
    ];
    const session = makeSession({ messages });
    const result = generateTitle(session);
    expect(result.title).toBe('Add dark mode toggle to the settings page');
    expect(result.source).toBe('user_message');
  });

  it('returns fallback title when no summary and no good messages', () => {
    const session = makeSession({
      messages: [],
      projectName: 'my-app',
      messageCount: 5,
    });
    const result = generateTitle(session);
    expect(result.title).toBe('my-app session (5 messages)');
    expect(result.source).toBe('fallback');
  });

  it('skips generic user messages like "ok" and "yes"', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'ok' }),
      makeMessage({ type: 'user', content: 'yes' }),
      makeMessage({
        type: 'user',
        content: 'Fix the authentication error in the login module',
      }),
    ];
    const session = makeSession({ messages });
    const result = generateTitle(session);
    expect(result.title).toBe('Fix the authentication error in the login module');
  });

  it('cleans the summary title (strips markdown, capitalizes)', () => {
    const session = makeSession({
      summary: '**fix** the _login_ bug',
    });
    const result = generateTitle(session);
    expect(result.title).toBe('Fix the login bug');
  });
});
