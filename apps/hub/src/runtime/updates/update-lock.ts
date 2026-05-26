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
import { z } from 'zod';

const LOCK_FILE = '.update.lock';
/** A lock older than this is considered stale (orphaned by a crashed process). */
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min

const LockMetadataSchema = z.object({
  pid: z.number().int(),
  startedAt: z.string(),
});
type LockMetadata = z.infer<typeof LockMetadataSchema>;

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
  /** Identity of the lock we wrote — used to refuse unlinking someone else's lock at release time. */
  #ownStartedAt: string | null = null;

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
      this.#ownStartedAt = meta.startedAt;
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
    // Symmetric release: only unlink the lock if the on-disk metadata
    // STILL identifies *us* as the holder. Otherwise the file was
    // stolen by a stale-break of our own lock (we exceeded
    // STALE_AFTER_MS without releasing, another process broke in),
    // and we mustn't delete their fresh lock.
    const current = this.#readMetadata();
    if (
      current !== null &&
      this.#ownStartedAt !== null &&
      current.pid === process.pid &&
      current.startedAt === this.#ownStartedAt
    ) {
      try {
        rmSync(this.#path, { force: true });
      } catch {
        // ignore
      }
    }
    this.#ownStartedAt = null;
  }

  isHeld(): boolean {
    return existsSync(this.#path);
  }

  /**
   * Non-blocking snapshot of the current holder's metadata, or `null`
   * when the lock isn't held. The route layer calls this *before*
   * opening the SSE stream so a lock contention can be returned as a
   * real HTTP 423 instead of an opaque progress-event error.
   */
  peekHolder(): LockMetadata | null {
    if (!existsSync(this.#path)) {
      return null;
    }
    return this.#readMetadata();
  }

  #readMetadata(): LockMetadata | null {
    try {
      const raw = readFileSync(this.#path, 'utf8').trim();
      const parsed = LockMetadataSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      // Lock file present but unreadable — treat as held with no metadata.
      return null;
    }
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
