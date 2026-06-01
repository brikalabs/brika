/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via a Bun macro (inlined into the compiled binary).
 *
 * Paths + instance identity come from {@link brikaContext} — this class
 * only owns the template-unpack step.
 */

import { inject, singleton } from '@brika/di';
import { loadTarBytes } from '@brika/embed' with { type: 'macro' };
import { brikaContext } from '../context/brika-context';
import { Logger } from '../logs/log-router';
import { unpackTemplates } from './templates-tar';

@singleton()
export class BrikaInitializer {
  readonly #logger = inject(Logger);

  get brikaDir(): string {
    return brikaContext.brikaDir;
  }

  get rootDir(): string {
    return brikaContext.rootDir;
  }

  get instanceId(): string {
    return brikaContext.instanceId;
  }

  /**
   * Initialize the .brika directory structure.
   * Unpacks templates from the embedded archive.
   */
  async init(): Promise<void> {
    this.#logger.info('Initializing Brika workspace directory', {
      brikaDir: brikaContext.brikaDir,
      instanceId: brikaContext.instanceId,
    });
    const archive = new Uint8Array(await loadTarBytes('apps/hub/src/templates'));
    await unpackTemplates(archive, brikaContext.rootDir, this.#logger);
    this.#logger.info('Brika workspace directory initialized successfully');
  }
}
