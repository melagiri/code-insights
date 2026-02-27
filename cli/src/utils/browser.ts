import { execFile } from 'child_process';

// No-op error callback: we fire-and-forget browser opens. If the command
// fails (e.g. xdg-open not installed), the user still sees the URL in the
// terminal and can open it manually. Without a callback, Node throws an
// unhandled error if the child process exits non-zero.
const noop = () => {};

/**
 * Open a URL in the default browser using platform-specific commands.
 * Uses execFile (not exec) to prevent shell injection.
 */
export function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [url], noop);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], noop);
  } else {
    execFile('xdg-open', [url], noop);
  }
}
