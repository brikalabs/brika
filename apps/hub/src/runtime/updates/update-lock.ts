/**
 * Cross-process exclusion lock for `brika update apply`.
 *
 * Single-flight inside the process is enough most of the time, but
 * `brika update` (CLI) and a UI-driven apply on the same hub end up
 * in the same address space anyway. The lock matters more for the
 * future `--offline` CLI path, which runs in its own process while
 * the hub may also be alive.
 *
 * Implementation: `open(path, 'wx')` — `wx` requests exclusive create,
 * which atomically fails with `EEXIST` if the file already exists.
 * Standard POSIX-portable pattern; no `flock`/`fcntl` per-platform
 * forking. Lock file contains the holder's PID + start time so a
 * stale lock can be force-released.
 */

import { closeSync, existsSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = '.update.lock';
/** A lock older than this is considered stale (orphaned by a crashed process). */
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min

interface LockMetadata {
  pid: number;
  startedAt: string;
}

export class UpdateLockHeldError extends Error {
  readonly heldBy: LockMetadata | null;

  constructor(heldBy: LockMetadata | null) {
    super(
      heldBy
        ? `Update lock held by pid ${heldBy.pid} since ${heldBy.startedAt}`
        : 'Update lock held by another process'
    );
    this.name = 'UpdateLockHeldError';
    this.heldBy = heldBy;
  }
}

export class UpdateLock {
  readonly #path: string;
  #fd: number | null = null;

  constructor(brikaDir: string) {
    this.#path = join(brikaDir, LOCK_FILE);
  }

  get path(): string {
    return this.#path;
  }

  /** Try to acquire; throws {@link UpdateLockHeldError} if held by another. */
  acquire(): void {
    this.#breakIfStale();
    try {
      // `wx` = create + write + exclusive (fail if exists). Atomic on POSIX & NTFS.
      this.#fd = openSync(this.#path, 'wx', 0o600);
      const meta: LockMetadata = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      };
      writeSync(this.#fd, `${JSON.stringify(meta)}\n`);
    } catch (err) {
      if (isEEXIST(err)) {
        throw new UpdateLockHeldError(this.#readMetadata());
      }
      throw err;
    }
  }

  release(): void {
    if (this.#fd !== null) {
      try {
        closeSync(this.#fd);
      } catch {
        // ignore
      }
      this.#fd = null;
    }
    try {
      rmSync(this.#path, { force: true });
    } catch {
      // ignore
    }
  }

  isHeld(): boolean {
    return existsSync(this.#path);
  }

  #readMetadata(): LockMetadata | null {
    try {
      const raw = readFileSync(this.#path, 'utf8').trim();
      const parsed = JSON.parse(raw) as Partial<LockMetadata>;
      if (typeof parsed.pid === 'number' && typeof parsed.startedAt === 'string') {
        return { pid: parsed.pid, startedAt: parsed.startedAt };
      }
    } catch {
      // Lock file present but unreadable — treat as held with no metadata.
    }
    return null;
  }

  #breakIfStale(): void {
    if (!existsSync(this.#path)) {
      return;
    }
    const meta = this.#readMetadata();
    if (meta === null) {
      return;
    }
    const ageMs = Date.now() - new Date(meta.startedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > STALE_AFTER_MS) {
      try {
        rmSync(this.#path, { force: true });
      } catch {
        // ignore
      }
    }
  }
}

function isEEXIST(err: unknown): boolean {
  return err !== null && typeof err === 'object' && 'code' in err && err.code === 'EEXIST';
}
