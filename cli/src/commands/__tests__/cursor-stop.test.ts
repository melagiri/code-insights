import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncSingleFile } = vi.hoisted(() => ({ syncSingleFile: vi.fn() }));

vi.mock('../sync.js', () => ({ syncSingleFile }));

describe('handleCursorStopPayload', () => {
  beforeEach(() => {
    syncSingleFile.mockReset();
  });

  it('syncs the supplied Cursor transcript after a completed stop event', async () => {
    const { handleCursorStopPayload } = await import('../cursor-stop.js');
    await handleCursorStopPayload({
      hook_event_name: 'stop',
      status: 'completed',
      conversation_id: 'conversation-123',
      transcript_path: '/Users/test/.cursor/projects/example/agent-transcripts/conversation-123/conversation-123.jsonl',
    }, { quiet: true });

    expect(syncSingleFile).toHaveBeenCalledOnce();
    expect(syncSingleFile).toHaveBeenCalledWith({
      filePath: '/Users/test/.cursor/projects/example/agent-transcripts/conversation-123/conversation-123.jsonl',
      sourceTool: 'cursor',
      quiet: true,
    });
  });

  it.each(['aborted', 'error', undefined])('ignores non-completed status %s', async (status) => {
    const { handleCursorStopPayload } = await import('../cursor-stop.js');
    await handleCursorStopPayload({
      hook_event_name: 'stop',
      status,
      conversation_id: 'conversation-123',
      transcript_path: '/tmp/transcript.jsonl',
    }, { quiet: true });

    expect(syncSingleFile).not.toHaveBeenCalled();
  });

  it('ignores payloads for another hook event', async () => {
    const { handleCursorStopPayload } = await import('../cursor-stop.js');
    await handleCursorStopPayload({
      hook_event_name: 'sessionEnd',
      status: 'completed',
      conversation_id: 'conversation-123',
      transcript_path: '/tmp/transcript.jsonl',
    }, { quiet: true });

    expect(syncSingleFile).not.toHaveBeenCalled();
  });

  it('requires both conversation_id and transcript_path', async () => {
    const { handleCursorStopPayload } = await import('../cursor-stop.js');
    await handleCursorStopPayload({ status: 'completed' }, { quiet: true });
    await handleCursorStopPayload({
      status: 'completed',
      conversation_id: 'conversation-123',
    }, { quiet: true });

    expect(syncSingleFile).not.toHaveBeenCalled();
  });

  it('swallows sync failures so the Cursor hook remains non-blocking', async () => {
    syncSingleFile.mockRejectedValueOnce(new Error('sync failed'));
    const { handleCursorStopPayload } = await import('../cursor-stop.js');

    await expect(handleCursorStopPayload({
      hook_event_name: 'stop',
      status: 'completed',
      conversation_id: 'conversation-123',
      transcript_path: '/tmp/transcript.jsonl',
    }, { quiet: true })).resolves.toBeUndefined();
  });
});
