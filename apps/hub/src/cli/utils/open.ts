/**
 * Open a URL in the default browser.
 * Cross-platform: macOS (open), Linux (xdg-open), Windows (start).
 */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  Bun.spawn([cmd, url], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
}
