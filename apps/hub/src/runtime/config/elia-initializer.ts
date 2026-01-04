/**
 * ELIA Directory Initializer
 *
 * Ensures the .elia directory structure exists with default files.
 * Template files are copied from apps/hub/src/templates/.elia/
 */

import { dirname, join } from 'node:path';
import { singleton } from '@elia/shared';

@singleton()
export class EliaInitializer {
  readonly #eliaDir: string;
  readonly #rootDir: string;
  readonly #templateDir: string;

  constructor() {
    // Derive paths from Bun.main or process.cwd()
    // Bun.main = /path/to/elia/apps/hub/src/main.ts
    // If Bun.main is available, use it to find project root
    if (Bun.main && typeof Bun.main === 'string' && Bun.main.includes('/apps/hub/src/')) {
      const parts = Bun.main.split('/');
      // Find index of 'apps' in the path
      const appsIndex = parts.lastIndexOf('apps');
      if (appsIndex > 0) {
        this.#rootDir = parts.slice(0, appsIndex).join('/');
      } else {
        // Fallback: go up 4 levels from main.ts
        this.#rootDir = parts.slice(0, -4).join('/');
      }
    } else {
      // Fallback: assume CWD is apps/hub, go up 2 levels
      const cwd = process.cwd();
      if (cwd.endsWith('/apps/hub')) {
        this.#rootDir = cwd.split('/').slice(0, -2).join('/');
      } else {
        // Assume CWD is project root
        this.#rootDir = cwd;
      }
    }
    this.#eliaDir = `${this.#rootDir}/.elia`;
    this.#templateDir = `${this.#rootDir}/apps/hub/src/templates/.elia`;
  }

  /**
   * Get the .elia directory path.
   */
  get eliaDir(): string {
    return this.#eliaDir;
  }

  /**
   * Get the project root directory.
   */
  get rootDir(): string {
    return this.#rootDir;
  }

  /**
   * Initialize the .elia directory structure.
   * Copies template files from apps/hub/templates/.elia/ that don't exist.
   * Never overwrites existing files.
   */
  async init(): Promise<void> {
    console.log(`[init] Initializing ${this.#eliaDir}`);

    // Ensure .elia directory exists
    await this.#ensureDir(this.#eliaDir);

    // Copy template files (only if they don't exist)
    await this.#copyTemplateDir(this.#templateDir, this.#eliaDir);

    // Cleanup deprecated directories
    await this.#cleanupDeprecated();

    console.log(`[init] .elia directory ready`);
  }

  /**
   * Recursively copy template directory, skipping existing files.
   */
  async #copyTemplateDir(sourceDir: string, targetDir: string): Promise<void> {
    const glob = new Bun.Glob('**/*');

    for await (const relativePath of glob.scan({ cwd: sourceDir, absolute: false, dot: true })) {
      const sourcePath = join(sourceDir, relativePath);
      const targetPath = join(targetDir, relativePath);

      // Check if it's a file
      const sourceFile = Bun.file(sourcePath);
      if (!(await sourceFile.exists())) continue;

      // Check if target already exists
      const targetFile = Bun.file(targetPath);
      if (await targetFile.exists()) {
        // File already exists, don't overwrite
        continue;
      }

      // Ensure parent directory exists
      const parentDir = dirname(targetPath);
      await this.#ensureDir(parentDir);

      // Copy file
      await Bun.write(targetPath, sourceFile);
      console.log(`[init] Created ${relativePath}`);
    }
  }

  /**
   * Ensure a directory exists, creating it if necessary.
   */
  async #ensureDir(dir: string): Promise<void> {
    try {
      await Bun.file(join(dir, '.keep')).exists();
    } catch {
      // Directory doesn't exist, create it
    }

    // Use Bun.write with a placeholder to ensure directory exists
    const keepFile = join(dir, '.keep');
    if (!(await Bun.file(keepFile).exists())) {
      // Create parent directory by writing a file
      await Bun.write(keepFile, '');
      // Remove the .keep file (we just needed to create the directory)
      await Bun.file(keepFile).exists(); // Ensure it was created
    }
  }

  /**
   * Clean up deprecated files and directories.
   */
  async #cleanupDeprecated(): Promise<void> {
    const deprecated = ['plugins-node'];

    for (const name of deprecated) {
      const path = join(this.#eliaDir, name);
      try {
        const stat = await Bun.file(path).exists();
        if (stat) {
          // It's a file, we can't easily check if it's a directory with Bun
          // Use fs for directory removal
          const { rm } = await import('node:fs/promises');
          await rm(path, { recursive: true, force: true });
          console.log(`[init] Removed deprecated: ${name}`);
        }
      } catch {
        // Doesn't exist, skip
      }
    }
  }
}
