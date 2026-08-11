import chalk from 'chalk';
import { syncSingleFile } from './sync.js';

export interface CursorStopOptions {
  quiet?: boolean;
}

export interface CursorStopPayload {
  conversation_id?: unknown;
  transcript_path?: unknown;
  status?: unknown;
  hook_event_name?: unknown;
}

export async function handleCursorStopPayload(
  payload: CursorStopPayload,
  options: CursorStopOptions = {},
): Promise<void> {
  const { quiet = false } = options;
  if (payload.hook_event_name && payload.hook_event_name !== 'stop') return;
  if (payload.status !== 'completed') return;

  if (typeof payload.conversation_id !== 'string' || !payload.conversation_id) {
    if (!quiet) console.error(chalk.red('[Code Insights] cursor-stop: missing conversation_id'));
    return;
  }
  if (typeof payload.transcript_path !== 'string' || !payload.transcript_path) {
    if (!quiet) console.error(chalk.red('[Code Insights] cursor-stop: missing transcript_path'));
    return;
  }

  try {
    await syncSingleFile({
      filePath: payload.transcript_path,
      sourceTool: 'cursor',
      quiet,
    });
  } catch {
    if (!quiet) console.error(chalk.yellow('[Code Insights] cursor-stop: sync failed'));
  }
}

export async function cursorStopCommand(options: CursorStopOptions = {}): Promise<void> {
  const stdinData = await readStdin();
  let payload: CursorStopPayload;
  try {
    payload = JSON.parse(stdinData) as CursorStopPayload;
  } catch {
    if (!options.quiet) console.error(chalk.red('[Code Insights] cursor-stop: invalid JSON on stdin'));
    return;
  }
  await handleCursorStopPayload(payload, options);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('{}');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
