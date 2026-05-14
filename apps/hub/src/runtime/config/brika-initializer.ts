/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via a Bun macro (inlined into the compiled binary).
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadTarBytes } from '@brika/db/macros' with { type: 'macro' };
import { inject, singleton } from '@brika/di';
import { installDir } from '@/cli/utils/runtime';
import { Logger } from '../logs/log-router';
import { unpackTemplates } from './templates-tar';

const isCompiled = import.meta.path.startsWith('/$bunfs/');

function resolveDataDir(): string {
  const autoDetected = isCompiled ? dirname(installDir) : join(process.cwd(), '.brika');
  return process.env.BRIKA_HOME ?? autoDetected;
}

/** 8 hex chars = 4 bytes of randomness, ~4 billion buckets. */
const INSTANCE_ID_BYTES = 4;
const INSTANCE_ID_FILE = 'instance.id';
const INSTANCE_ID_RE = /^[0-9a-f]{8}$/;

@singleton()
export class BrikaInitializer {
  readonly #logger = inject(Logger);
  readonly #brikaDir = resolveDataDir();
  readonly #rootDir = dirname(this.#brikaDir);
  #cachedInstanceId: string | null = null;

  get brikaDir(): string {
    return this.#brikaDir;
  }

  get rootDir(): string {
    return this.#rootDir;
  }

  /**
   * Stable identifier for THIS `.brika/` directory, persisted to
   * `${brikaDir}/instance.id`. Used as the suffix on Keychain service
   * names so multiple Brika installs on one machine each get their own
   * isolated secret bucket.
   *
   * Generated lazily on first access; written atomically so concurrent
   * boots converge on the same value (last-writer-wins is fine — both
   * winners would be valid UIDs, and the file is read once per process).
   */
  get instanceId(): string {
    if (this.#cachedInstanceId !== null) {
      return this.#cachedInstanceId;
    }
    this.#cachedInstanceId = this.#readOrGenerateInstanceId();
    return this.#cachedInstanceId;
  }

  #readOrGenerateInstanceId(): string {
    const path = join(this.#brikaDir, INSTANCE_ID_FILE);
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8').trim();
      if (INSTANCE_ID_RE.test(raw)) {
        return raw;
      }
      // Corrupt/unexpected contents — regenerate. The old value is
      // overwritten below; any orphaned Keychain entries remain
      // harmless until the user cleans them manually.
      this.#logger.warn('instance.id has unexpected format; regenerating', {
        path,
        found: raw.slice(0, 32),
      });
    }
    const fresh = randomBytes(INSTANCE_ID_BYTES).toString('hex');
    mkdirSync(this.#brikaDir, { recursive: true });
    writeFileSync(path, fresh, { encoding: 'utf8', mode: 0o600 });
    this.#logger.info('Generated new Brika instance id', { path, instanceId: fresh });
    return fresh;
  }

  /**
   * Initialize the .brika directory structure.
   * Unpacks templates from the embedded archive.
   */
  async init(): Promise<void> {
    this.#logger.info('Initializing Brika workspace directory', {
      brikaDir: this.#brikaDir,
    });
    const archive = new Uint8Array(await loadTarBytes('apps/hub/src/templates'));
    await unpackTemplates(archive, this.#rootDir, this.#logger);
    this.#logger.info('Brika workspace directory initialized successfully');
  }
}
