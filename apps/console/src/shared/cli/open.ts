/**
 * Cross-platform "open a URL in the default browser" helper. macOS
 * uses `open`, Linux `xdg-open`, Windows `start`. Returns nothing —
 * the caller never gets to know whether the spawn succeeded, so don't
 * promise success in user-facing copy beyond "opening".
 */

function browserCommand(): string {
  if (process.platform === 'darwin') {
    return 'open';
  }
  if (process.platform === 'win32') {
    return 'start';
  }
  return 'xdg-open';
}

export function openBrowser(url: string): void {
  Bun.spawn([browserCommand(), url], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
}
