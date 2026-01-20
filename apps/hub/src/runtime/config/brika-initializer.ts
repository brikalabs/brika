/**
 * BRIKA Directory Initializer
 *
 * Ensures the .brika directory structure exists with default files.
 * Templates are packed via the folder-tar plugin (works at both runtime and bundle-time).
 */

import { join } from "node:path";
import { singleton } from "@brika/shared";
import { unpackTemplates } from "./templates-tar";

@singleton()
export class BrikaInitializer {
  readonly #brikaDir: string;
  readonly #rootDir: string;

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
    console.log(`[init] Initializing ${this.#brikaDir}`);
    const { default: archive } = await import("@/templates.tar");
    await unpackTemplates(archive, this.#rootDir);
    console.log("[init] .brika directory ready");
  }
}
