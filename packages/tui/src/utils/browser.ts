/**
 * Best-effort open-in-browser. Returns synchronously after spawning;
 * the URL is also displayed in the TUI so the user can copy if the
 * spawn fails (e.g. xdg-open missing on minimal Linux).
 */

export function openInBrowser(url: string): void {
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
