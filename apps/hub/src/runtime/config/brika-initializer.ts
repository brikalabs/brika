/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed at bundle-time via macro and unpacked at runtime.
 */

import { join } from 'node:path';
import { singleton } from '@brika/shared';
import { packTemplates } from '@/runtime/config/templates-tar' with { type: 'macro' };
import { unpackTemplates } from '@/runtime/config/templates-tar';

@singleton()
export class BrikaInitializer {
  readonly #brikaDir: string;
  readonly #rootDir: string;

  constructor() {
    // Target directory: always current working directory
    this.#rootDir = process.cwd();
    this.#brikaDir = join(this.#rootDir, '.brika');
  }

  /**
   * Get the .brika directory path.
   */
  get brikaDir(): string {
    return this.#brikaDir;
  }

  /**
   * Get the project root directory.
   */
  get rootDir(): string {
    return this.#rootDir;
  }

  /**
   * Initialize the .brika directory structure.
   * Unpacks templates that were packed at bundle-time.
   * Never overwrites existing files.
   */
  async init(): Promise<void> {
    console.log(`[init] Initializing ${this.#brikaDir}`);
    await unpackTemplates(await packTemplates(), this.#rootDir);
    console.log('[init] .brika directory ready');
  }
}
