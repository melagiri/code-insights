import { execFile } from 'child_process';

/**
 * Open a URL in the default browser using platform-specific commands.
 * Uses execFile (not exec) to prevent shell injection.
 */
export function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}
