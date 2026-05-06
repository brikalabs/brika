/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via a Bun macro (inlined into the compiled binary).
 */

import { dirname, join } from "node:path";
import { loadTarBytes } from "@brika/db/macros" with { type: "macro" };
import { inject, singleton } from "@brika/di";
import { installDir } from "@/cli/utils/runtime";
import { Logger } from "../logs/log-router";
import { unpackTemplates } from "./templates-tar";

const isCompiled = import.meta.path.startsWith('/$bunfs/');

function resolveDataDir(): string {
  const autoDetected = isCompiled 
    ? dirname(installDir) 
    : join(process.cwd(), '.brika');
  return process.env.BRIKA_HOME ?? autoDetected;
}

@singleton()
export class BrikaInitializer {
  readonly #logger = inject(Logger);
  readonly #brikaDir = resolveDataDir();
  readonly #rootDir = dirname(this.#brikaDir);

  get brikaDir(): string {
    return this.#brikaDir;
  }

  get rootDir(): string {
    return this.#rootDir;
  }

  /**
   * Initialize the .brika directory structure.
   * Unpacks templates from the embedded archive.
   */
  async init(): Promise<void> {
    this.#logger.info("Initializing Brika workspace directory", {
      brikaDir: this.#brikaDir,
    });
    const archive = new Uint8Array(await loadTarBytes('apps/hub/src/templates'));
    await unpackTemplates(archive, this.#rootDir, this.#logger);
    this.#logger.info("Brika workspace directory initialized successfully");
  }
}
