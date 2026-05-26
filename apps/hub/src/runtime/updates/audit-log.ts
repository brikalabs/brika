/**
 * Update audit log — append-only JSONL at `${brikaDir}/updates.log`.
 *
 * Captures every phase transition, signature verification result,
 * rollback decision, and final outcome. Local-only by default;
 * telemetry uploads are wired in a later phase. Two reasons to keep
 * this even without telemetry:
 *
 *   1. Operator debugging — `cat ~/.brika/updates.log` should answer
 *      "what happened during the upgrade two weeks ago?"
 *   2. Forensics — the orchestrator can read its own history on next
 *      boot to detect "we rolled back N times in a row, stop trying".
 *
 * Rotation: when the file exceeds `MAX_BYTES`, we rename it to
 * `updates.log.1` (overwriting any older rotation) and start fresh.
 * One rotation back is enough — beyond that you should be using a
 * proper log shipper, not tail-grepping this file.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const LOG_FILE = 'updates.log';
const ROTATED_SUFFIX = '.1';
const MAX_BYTES = 1024 * 1024; // 1 MB

export type AuditEventKind =
  | 'check.start'
  | 'check.success'
  | 'check.failure'
  | 'apply.start'
  | 'apply.phase'
  | 'apply.success'
  | 'apply.failure'
  | 'apply.rolled-back'
  | 'apply.refused'
  | 'boot.attempt'
  | 'boot.success'
  | 'boot.crash-detected';

export interface AuditEvent {
  ts: string;
  kind: AuditEventKind;
  /** Free-form key/value context. Keep small and serializable. */
  data: Record<string, unknown>;
}

export class UpdateAuditLog {
  readonly #path: string;
  readonly #rotatedPath: string;

  constructor(brikaDir: string) {
    this.#path = join(brikaDir, LOG_FILE);
    this.#rotatedPath = `${this.#path}${ROTATED_SUFFIX}`;
  }

  /** The on-disk path; exposed for tests and `brika diagnose` output. */
  get path(): string {
    return this.#path;
  }

  append(kind: AuditEventKind, data: Record<string, unknown> = {}): void {
    const event: AuditEvent = {
      ts: new Date().toISOString(),
      kind,
      data,
    };
    try {
      this.#rotateIfNeeded();
      mkdirSync(dirname(this.#path), { recursive: true });
      appendFileSync(this.#path, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Audit logging must never throw into the caller — a failed
      // write is annoying but not actionable, and we don't want it to
      // mask the actual update failure being recorded.
    }
  }

  #rotateIfNeeded(): void {
    if (!existsSync(this.#path)) {
      return;
    }
    try {
      const stats = statSync(this.#path);
      if (stats.size < MAX_BYTES) {
        return;
      }
      renameSync(this.#path, this.#rotatedPath);
    } catch {
      // Ignore — rotation failure shouldn't block writes.
    }
  }
}
