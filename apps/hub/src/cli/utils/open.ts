/**
 * Open a URL in the default browser.
 * Cross-platform: macOS (open), Linux (xdg-open), Windows (start).
 */
function getBrowserCommand(): string {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'start';
  return 'xdg-open';
}

export function openBrowser(url: string): void {
  Bun.spawn([getBrowserCommand(), url], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
}
