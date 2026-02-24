/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via the folder-tar plugin (works at both runtime and bundle-time).
 */

import { dirname, join } from "node:path";
import { inject, singleton } from "@brika/di";
import { installDir } from "@/cli/utils/runtime";
import { Logger } from "../logs/log-router";
import { unpackTemplates } from "./templates-tar";

const isCompiled = import.meta.path.startsWith('/$bunfs/');

function resolveDataDir(): string {
  return isCompiled ? dirname(installDir) : join(process.cwd(), '.brika');
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
    const { default: archive } = await import("@/templates.tar");
    await unpackTemplates(archive, this.#rootDir, this.#logger);
    this.#logger.info("Brika workspace directory initialized successfully");
  }
}
