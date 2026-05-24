/**
 * Ephemeral `/user/<token>` root registry.
 *
 * When a plugin invokes `ctx.ui.pickFile()`, the hub displays a file
 * picker, the user selects a host-side path, and the hub calls
 * `mint(hostPath)` here. The registry returns a virtual path of the
 * form `/user/<token>/<filename>` that the plugin uses to read the
 * file via the existing `ctx.fs.*` machinery — the read happens
 * under the same scope check + symlink guard as everything else.
 *
 * Lifetime: a token survives until either the plugin process exits,
 * the configured TTL elapses, or the plugin calls
 * `ctx.ui.revokeFile(path)`. There's no persistence — tokens are
 * minted per session.
 *
 * Why a separate registry (rather than reusing the four named virtual
 * roots): each `/user/<token>` lives in an arbitrary host directory.
 * The standard root → backing-dir map can't accommodate that — every
 * token has its own backing dir. The ephemeral registry is the only
 * place that bridges the gap.
 */

import { randomBytes } from 'node:crypto';
import { basename, normalize as nodeNormalize } from 'node:path';

/**
 * One minted token. The host-side path is the FILE the user picked
 * (not its parent directory) — we expose `/user/<token>/<filename>`
 * to the plugin so the virtual path is stable while the underlying
 * file lives anywhere on disk.
 */
export interface EphemeralEntry {
  readonly token: string;
  readonly hostPath: string;
  readonly fileName: string;
  readonly virtualPath: string;
  readonly mintedAt: number;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export class EphemeralRoots {
  readonly #byToken = new Map<string, EphemeralEntry>();
  readonly #ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.#ttlMs = ttlMs;
  }

  /**
   * Register a host-side path and return the bound entry. The token
   * is a 16-byte hex string; the virtual path is
   * `/user/<token>/<basename(hostPath)>`.
   */
  mint(hostPath: string): EphemeralEntry {
    const token = randomBytes(16).toString('hex');
    const fileName = basename(hostPath);
    const virtualPath = `/user/${token}/${fileName}`;
    const now = Date.now();
    const entry: EphemeralEntry = {
      token,
      hostPath: nodeNormalize(hostPath),
      fileName,
      virtualPath,
      mintedAt: now,
      expiresAt: now + this.#ttlMs,
    };
    this.#byToken.set(token, entry);
    return entry;
  }

  /**
   * Resolve a virtual `/user/<token>/<name>` to its host path. Returns
   * null on unknown token, expired token, or path that doesn't match
   * the registered file name (a stale plugin trying to rebuild the
   * URL after the file was overwritten gets a clean denial rather
   * than reaching an arbitrary path).
   */
  resolve(virtualPath: string): string | null {
    const match = /^\/user\/([0-9a-f]+)\/(.+)$/.exec(virtualPath);
    if (!match) {
      return null;
    }
    const [, token, requestedName] = match;
    if (token === undefined || requestedName === undefined) {
      return null;
    }
    const entry = this.#byToken.get(token);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.#byToken.delete(token);
      return null;
    }
    if (requestedName !== entry.fileName) {
      return null;
    }
    return entry.hostPath;
  }

  /** Revoke a single token. Returns true iff it existed. */
  revoke(token: string): boolean {
    return this.#byToken.delete(token);
  }

  /** Drop every token. Called when the plugin process exits. */
  revokeAll(): void {
    this.#byToken.clear();
  }

  /** Test hook. */
  size(): number {
    return this.#byToken.size;
  }
}
