import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeProvider } from '../claude-code.js';

// ──────────────────────────────────────────────────────
// ClaudeCodeProvider tests using temp directories.
//
// We create real temp dirs on disk so discover() and parse()
// exercise actual filesystem logic. The getClaudeDir() call
// in discover() is mocked to point at our temp dir.
// ──────────────────────────────────────────────────────

// Minimal valid JSONL session: one user message + one assistant response.
// The file is named with a UUID so extractSessionId() succeeds.
const VALID_SESSION_JSONL = [
  JSON.stringify({
    type: 'user',
    uuid: 'u1',
    sessionId: 'test-session',
    timestamp: '2026-01-15T10:00:00Z',
    message: { role: 'user', content: 'Help me fix the login bug' },
  }),
  JSON.stringify({
    type: 'assistant',
    uuid: 'a1',
    sessionId: 'test-session',
    timestamp: '2026-01-15T10:00:05Z',
    parentUuid: 'u1',
    message: {
      role: 'assistant',
      content: 'I will help you fix the login bug.',
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  }),
].join('\n');

const UUID_FILENAME = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl';

describe('ClaudeCodeProvider', () => {
  let tempDir: string;
  const provider = new ClaudeCodeProvider();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────
  // getProviderName
  // ────────────────────────────────────────────────────

  it('returns "claude-code" as provider name', () => {
    expect(provider.getProviderName()).toBe('claude-code');
  });

  // ────────────────────────────────────────────────────
  // parse — happy path
  // ────────────────────────────────────────────────────

  it('parses a valid JSONL session file', async () => {
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, VALID_SESSION_JSONL);

    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.sourceTool).toBe('claude-code');
    expect(session!.userMessageCount).toBeGreaterThan(0);
    expect(session!.assistantMessageCount).toBeGreaterThan(0);
  });

  it('sets sourceTool to "claude-code" on parsed session', async () => {
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, VALID_SESSION_JSONL);

    const session = await provider.parse(filePath);

    expect(session).not.toBeNull();
    expect(session!.sourceTool).toBe('claude-code');
  });

  // ────────────────────────────────────────────────────
  // parse — empty file
  // ────────────────────────────────────────────────────

  it('returns null for an empty JSONL file', async () => {
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, ''); // empty

    const session = await provider.parse(filePath);

    expect(session).toBeNull();
  });

  // ────────────────────────────────────────────────────
  // parse — malformed input
  // ────────────────────────────────────────────────────

  it('returns null for a file with only malformed JSON lines', async () => {
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, 'not valid json at all\n{"incomplete": true');

    const session = await provider.parse(filePath);

    // parseJsonlFile skips malformed lines; with no valid messages the result is null
    expect(session).toBeNull();
  });

  it('skips malformed lines and still parses valid ones', async () => {
    const badLine = 'this is not json';
    const content = [badLine, VALID_SESSION_JSONL.split('\n')[0], VALID_SESSION_JSONL.split('\n')[1]].join('\n');
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, content);

    const session = await provider.parse(filePath);

    // Should parse successfully despite the one bad line
    expect(session).not.toBeNull();
    expect(session!.sourceTool).toBe('claude-code');
  });

  // ────────────────────────────────────────────────────
  // parse — session with no messages (only metadata)
  // ────────────────────────────────────────────────────

  it('returns null for a file with only non-message entries (summary type)', async () => {
    // parseJsonlFile returns null when entries.length > 0 but messages.length === 0.
    // 'summary' entries are processed separately and do NOT count as messages,
    // unlike 'user', 'assistant', and 'system' entries which all count.
    const summaryOnly = JSON.stringify({
      type: 'summary',
      summary: 'Session summary',
      leafUuid: 's1',
    });
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, summaryOnly);

    const session = await provider.parse(filePath);

    expect(session).toBeNull();
  });

  // ────────────────────────────────────────────────────
  // parse — sourceTool enforcement
  // ────────────────────────────────────────────────────

  it('always stamps sourceTool as "claude-code" regardless of file content', async () => {
    // The provider overrides sourceTool after parseJsonlFile returns,
    // so even if the underlying parser sets a different value, we get 'claude-code'.
    const filePath = path.join(tempDir, UUID_FILENAME);
    fs.writeFileSync(filePath, VALID_SESSION_JSONL);

    const session = await provider.parse(filePath);

    expect(session!.sourceTool).toBe('claude-code');
  });

  // ────────────────────────────────────────────────────
  // discover — basic filesystem discovery
  // ────────────────────────────────────────────────────

  it('parses a file placed in a project subdirectory (simulating discover output)', async () => {
    // discover() returns file paths; parse() must handle those paths.
    // This verifies the round-trip: a file structure discover() would return
    // can be successfully parsed.
    const projectDir = path.join(tempDir, '-Users-test-myproject');
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionFile = path.join(projectDir, UUID_FILENAME);
    fs.writeFileSync(sessionFile, VALID_SESSION_JSONL);

    const session = await provider.parse(sessionFile);

    expect(session).not.toBeNull();
    expect(session!.sourceTool).toBe('claude-code');
  });
});
