import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import type { Connect } from 'vite';

/** Match a `:line` or `:line:col` suffix at the end of a path string. */
const LINE_SUFFIX_RE = /(:\d+(?::\d+)?)$/;

interface Logger {
  warn(msg: string): void;
}

export interface OpenInEditorOptions {
  readonly viteRoot: string;
  readonly workspaceRoot: string | null;
  readonly logger: Logger;
}

/**
 * Resolve the host header from `req.headers.host` for the same-origin check.
 * Treats missing/invalid headers as "unknown" — the caller rejects the
 * request rather than guessing.
 */
function sameOriginHost(req: IncomingMessage): string | null {
  const host = req.headers.host;
  return typeof host === 'string' && host.length > 0 ? host : null;
}

/**
 * Reject requests originating from a different origin. Only the `host` field
 * of `Origin` / `Referer` is compared — we don't care about scheme. Returns
 * `true` if the request should be served.
 */
function isSameOrigin(req: IncomingMessage): boolean {
  const expected = sameOriginHost(req);
  if (!expected) {
    return false;
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  // A state-changing endpoint must see at least one of Origin/Referer — both
  // missing is the exact shape of a `<img src>` / `<script src>` drive-by from
  // a cross-origin page (no preflight, no Origin, Referrer-Policy may strip
  // referer). Reject outright.
  if (typeof origin !== 'string' && typeof referer !== 'string') {
    return false;
  }
  for (const raw of [origin, referer]) {
    if (typeof raw !== 'string' || raw.length === 0) {
      continue;
    }
    let candidateHost: string;
    try {
      candidateHost = new URL(raw).host;
    } catch {
      return false;
    }
    if (candidateHost !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve a file string from the overlay (`file:line` or `file:line:col`) to
 * an absolute realpath, gated by a base-directory containment check.
 *
 * Returns `null` if the path resolves outside both `viteRoot` and
 * `workspaceRoot` after symlink resolution. The line suffix is stripped
 * before `existsSync` / `realpath` but preserved on the returned string so
 * editors like `code --goto` can position the cursor.
 */
function resolveOpenTarget(
  file: string,
  viteRoot: string,
  workspaceRoot: string | null
): string | null {
  const suffixMatch = LINE_SUFFIX_RE.exec(file);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  const bare = suffix ? file.slice(0, -suffix.length) : file;

  const candidates: string[] = [];
  if (isAbsolute(bare)) {
    candidates.push(bare);
  } else {
    if (workspaceRoot) {
      candidates.push(resolve(workspaceRoot, bare));
    }
    candidates.push(resolve(viteRoot, bare));
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    let real: string;
    try {
      real = realpathSync(candidate);
    } catch {
      continue;
    }
    if (!isPathInside(real, viteRoot) && !(workspaceRoot && isPathInside(real, workspaceRoot))) {
      // Realpath escaped the allowed bases (e.g. via symlink).
      return null;
    }
    return real + suffix;
  }
  return null;
}

function isPathInside(target: string, base: string): boolean {
  if (target === base) {
    return true;
  }
  return target.startsWith(`${base}/`);
}

/**
 * Create a Connect middleware that responds to `GET /__open-in-editor?file=...`
 * by spawning `$LAUNCH_EDITOR` (or `code`) on the resolved file. The handler
 * enforces a same-origin check and a path-containment check before invoking
 * the editor binary.
 */
export function createOpenInEditorMiddleware(
  options: OpenInEditorOptions
): Connect.NextHandleFunction {
  const { viteRoot, workspaceRoot, logger } = options;
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__open-in-editor')) {
      next();
      return;
    }
    // Spawning an editor is state-changing — require POST so a cross-origin
    // `<img src>` / preload / link prefetch can't reach this code path
    // without a preflight (which would also have to pass the same-origin
    // check below).
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end('Method Not Allowed');
      return;
    }
    if (!isSameOrigin(req)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const file = url.searchParams.get('file');
    if (!file) {
      res.statusCode = 400;
      res.end('Missing file parameter');
      return;
    }
    const filePath = resolveOpenTarget(file, viteRoot, workspaceRoot);
    if (!filePath) {
      res.statusCode = 400;
      res.end('Path outside allowed roots');
      return;
    }
    const editor = process.env.LAUNCH_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? 'code';
    const args = editor === 'code' || editor.endsWith('/code') ? ['--goto', filePath] : [filePath];
    execFile(editor, args, (err) => {
      if (err) {
        logger.warn(`[i18n-dev] Failed to open editor: ${err.message}`);
      }
    });
    res.statusCode = 200;
    res.end('OK');
  };
}
