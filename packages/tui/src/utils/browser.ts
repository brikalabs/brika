/**
 * Best-effort open-in-browser. Returns synchronously after spawning;
 * the URL is also displayed in the TUI so the user can copy if the
 * spawn fails (e.g. xdg-open missing on minimal Linux).
 *
 * The URL is validated against http(s) only and the spawn uses the
 * array form (no shell) so neither `javascript:` schemes nor shell
 * metacharacters in the URL can escape into a command.
 */

const SAFE_SCHEME = /^https?:\/\//i;

export function openInBrowser(url: string): void {
  if (!SAFE_SCHEME.test(url)) {
    return;
  }
  try {
    Bun.spawn(openCmd(url), { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    /* user can copy from screen */
  }
}

function openCmd(url: string): string[] {
  if (process.platform === 'darwin') {
    return ['open', url];
  }
  if (process.platform === 'win32') {
    return ['cmd', '/c', 'start', url];
  }
  return ['xdg-open', url];
}
