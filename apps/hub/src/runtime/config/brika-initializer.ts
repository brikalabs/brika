/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via the folder-tar plugin (works at both runtime and bundle-time).
 */

import { join } from "node:path";
import { inject, singleton } from "@brika/di";
import { Logger } from "../logs/log-router";
import { unpackTemplates } from "./templates-tar";

@singleton()
export class BrikaInitializer {
  readonly #brikaDir: string;
  readonly #rootDir: string;
  readonly #logger = inject(Logger);

  constructor() {
    this.#rootDir = process.cwd();
    this.#brikaDir = join(this.#rootDir, ".brika");
  }

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
