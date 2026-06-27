/**
 * FileBackend — AES-256-GCM encrypted JSON store for headless / container
 * deployments where no OS keychain is available.
 *
 * Threat model
 *   - Confidentiality vs. read-only file exfiltration (backup tape, log
 *     bundle, partial container escape that grabs `${BRIKA_HOME}/secrets.json`
 *     but not the master key).
 *   - NOT a defence against a full local attacker on the same host. Anyone
 *     who can read both `secrets.json` and the master-key source can decrypt
 *     everything — exactly the same trust boundary as the OS keychain when
 *     the user is logged in.
 *
 * Master key resolution (first match wins):
 *   1. `BRIKA_SECRET_KEY` env var — base64 of 32 random bytes. Recommended
 *      for production: pass via Docker / K8s secret manager so the key never
 *      lives on disk next to the ciphertext.
 *   2. `${BRIKA_HOME}/master.key` — auto-generated on first run with 0600
 *      perms. Equivalent security to plaintext-on-disk against a local
 *      attacker, but isolates exfiltration paths that only capture
 *      `secrets.json`.
 *
 * File format (`secrets.json`):
 *   { "version": 1,
 *     "entries": {
 *       "<service>::<name>": "<base64(iv[12] | ciphertext | authTag[16])>"
 *     } }
 *
 * Writes are atomic (write-to-tmp + rename). Operations are serialised
 * through an in-process mutex so concurrent set/delete from async callers
 * cannot interleave file reads with stale state.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveSystemDir } from '@brika/sdk/exec-context';
import { brikaContext } from '../../context/brika-context';
import type { SecretBackend, SecretRef } from './types';

function isENOENT(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'ENOENT';
}

const FILE_VERSION = 1;
const SECRETS_FILENAME = 'secrets.json';
const MASTER_KEY_FILENAME = 'master.key';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const SECURE_FILE_MODE = 0o600;
const SECURE_DIR_MODE = 0o700;

interface FilePayload {
  readonly version: number;
  readonly entries: Record<string, string>;
}

function refKey(ref: SecretRef): string {
  return `${ref.service}::${ref.name}`;
}

/**
 * Resolve the AES-256 master key. Env var wins; otherwise read or generate
 * a key file with 0600 perms. Throws if either source yields a key of
 * incorrect length, or if the key file exists with permissive modes.
 */
export function resolveMasterKey(brikaDir: string): Buffer {
  const fromEnv = process.env.BRIKA_SECRET_KEY;
  if (fromEnv !== undefined && fromEnv !== '') {
    const decoded = Buffer.from(fromEnv, 'base64');
    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        `BRIKA_SECRET_KEY must be base64-encoded ${KEY_BYTES} bytes (got ${decoded.length} bytes after decode)`
      );
    }
    return decoded;
  }

  const path = join(brikaDir, MASTER_KEY_FILENAME);
  if (existsSync(path)) {
    assertSecureMode(path);
    const raw = readFileSync(path);
    if (raw.length !== KEY_BYTES) {
      throw new Error(
        `Master key file ${path} is corrupt (expected ${KEY_BYTES} bytes, got ${raw.length}). Delete it to regenerate (this will invalidate any existing secrets), or set BRIKA_SECRET_KEY to recover.`
      );
    }
    return raw;
  }

  const fresh = randomBytes(KEY_BYTES);
  mkdirSync(brikaDir, { recursive: true, mode: SECURE_DIR_MODE });
  writeFileSync(path, fresh, { mode: SECURE_FILE_MODE });
  return fresh;
}

function assertSecureMode(path: string): void {
  if (process.platform === 'win32') {
    // POSIX mode bits are not meaningful on Windows; ACLs handle isolation.
    return;
  }
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Master key file ${path} has insecure permissions (0${mode.toString(8)}). Run \`chmod 600 ${path}\` to restrict access.`
    );
  }
}

export interface FileBackendOptions {
  /** Directory containing `secrets.json` and (optionally) `master.key`. Defaults to `brikaContext.systemDir`. */
  readonly brikaDir?: string;
  /** Override master key resolution (used by tests). */
  readonly masterKey?: Buffer;
}

export class FileBackend implements SecretBackend {
  readonly #brikaDir: string;
  readonly #filePath: string;
  readonly #key: Buffer;
  #writeChain: Promise<unknown> = Promise.resolve();

  constructor(options: FileBackendOptions = {}) {
    // Re-read BRIKA_HOME at construction time so tests can redirect storage
    // (brikaContext freezes at module load, which doesn't help test setup).
    // An explicit `brikaDir` option is used verbatim (the dir that directly
    // holds secrets.json); the env/default path routes through `.system/`.
    this.#brikaDir =
      options.brikaDir ??
      (process.env.BRIKA_HOME ? resolveSystemDir(process.env.BRIKA_HOME) : brikaContext.systemDir);
    this.#filePath = join(this.#brikaDir, SECRETS_FILENAME);
    this.#key = options.masterKey ?? resolveMasterKey(this.#brikaDir);
  }

  async get(ref: SecretRef): Promise<string | null> {
    // Wait for any in-flight mutation so we see a consistent post-write view.
    await this.#writeChain;
    const payload = this.#read();
    const blob = payload.entries[refKey(ref)];
    if (blob === undefined) {
      return null;
    }
    return this.#decrypt(blob);
  }

  async set(ref: SecretRef & { value: string }): Promise<void> {
    await this.#mutate((payload) => {
      const next = { ...payload.entries };
      next[refKey(ref)] = this.#encrypt(ref.value);
      return { version: FILE_VERSION, entries: next };
    });
  }

  async delete(ref: SecretRef): Promise<boolean> {
    let existed = false;
    await this.#mutate((payload) => {
      const key = refKey(ref);
      if (!(key in payload.entries)) {
        return payload;
      }
      existed = true;
      const next = { ...payload.entries };
      delete next[key];
      return { version: FILE_VERSION, entries: next };
    });
    return existed;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  #read(): FilePayload {
    let raw: string;
    try {
      raw = readFileSync(this.#filePath, 'utf8');
    } catch (error) {
      if (isENOENT(error)) {
        return { version: FILE_VERSION, entries: {} };
      }
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isFilePayload(parsed)) {
      throw new Error(`Secrets file ${this.#filePath} is malformed`);
    }
    if (parsed.version !== FILE_VERSION) {
      throw new Error(
        `Secrets file ${this.#filePath} has unsupported version ${parsed.version} (expected ${FILE_VERSION})`
      );
    }
    return parsed;
  }

  #writeAtomic(payload: FilePayload): void {
    mkdirSync(dirname(this.#filePath), { recursive: true, mode: SECURE_DIR_MODE });
    const tmp = `${this.#filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), { mode: SECURE_FILE_MODE });
    renameSync(tmp, this.#filePath);
    // Defensive against filesystems where the rename clears the tmp's mode bits via umask.
    if (process.platform !== 'win32') {
      chmodSync(this.#filePath, SECURE_FILE_MODE);
    }
  }

  /** Serialise read-modify-write so concurrent set/delete cannot lose data. */
  async #mutate(update: (current: FilePayload) => FilePayload): Promise<void> {
    const next = this.#writeChain.then(() => {
      const current = this.#read();
      const updated = update(current);
      if (updated !== current) {
        this.#writeAtomic(updated);
      }
    });
    this.#writeChain = next.catch(() => {
      // Swallow on the chain so a single failure doesn't poison future writes.
      // The original promise still rejects to the caller below.
    });
    await next;
  }

  #encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, tag]).toString('base64');
  }

  #decrypt(blob: string): string {
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Secret blob is truncated');
    }
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

function isFilePayload(value: unknown): value is FilePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('version' in value) || typeof value.version !== 'number') {
    return false;
  }
  if (!('entries' in value) || typeof value.entries !== 'object' || value.entries === null) {
    return false;
  }
  for (const v of Object.values(value.entries)) {
    if (typeof v !== 'string') {
      return false;
    }
  }
  return true;
}
