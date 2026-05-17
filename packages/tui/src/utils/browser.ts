/**
 * Best-effort open-in-browser. Returns synchronously after spawning;
 * the URL is also displayed in the TUI so the user can copy if the
 * spawn fails (e.g. xdg-open missing on minimal Linux).
 *
 * The URL is validated against http(s) only and the spawn uses the
 * array form (no shell) so neither `javascript:` schemes nor shell
 * metacharacters in the URL can escape into a command.
 *
 * The platform-opener call is injectable via `deps.spawn` so tests can
 * exercise this function without physically launching the user's
 * browser.
 */

const SAFE_SCHEME = /^https?:\/\//i;

export interface OpenInBrowserDeps {
  /** Override the default `Bun.spawn`. Useful for tests. */
  readonly spawn?: (cmd: ReadonlyArray<string>) => void;
}

function defaultSpawn(cmd: ReadonlyArray<string>): void {
  Bun.spawn([...cmd], { stdout: 'ignore', stderr: 'ignore' });
}

export function openInBrowser(url: string, deps: OpenInBrowserDeps = {}): void {
  if (!SAFE_SCHEME.test(url)) {
    return;
  }
  const spawn = deps.spawn ?? defaultSpawn;
  try {
    spawn(openCmd(url));
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
