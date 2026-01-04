/**
 * YAML Workflow Loader
 *
 * Loads workflows from YAML files with hot-reload support.
 */

import type { Workflow } from '@brika/sdk';
import { inject, type Json, singleton } from '@brika/shared';
import { LogRouter } from '@/runtime/logs/log-router';
import { AutomationEngine } from './automation-engine';

@singleton()
export class YamlWorkflowLoader {
  private readonly logs = inject(LogRouter);
  private readonly engine = inject(AutomationEngine);

  #dir: string | null = null;
  #watcher: Timer | null = null;
  readonly #fileHashes = new Map<string, number>(); // file -> hash for change detection
  readonly #loaded = new Map<string, string>(); // file -> workflow ID
  readonly #idToFile = new Map<string, string>(); // workflow ID -> file
  readonly #debounce = new Map<string, ReturnType<typeof setTimeout>>();

  get dir(): string | null {
    return this.#dir;
  }

  /**
   * Load all workflows from a directory
   */
  async loadDir(dir: string): Promise<void> {
    this.#dir = dir;

    // Ensure directory exists using Bun
    try {
      // Try to list directory to check if it exists
      const glob = new Bun.Glob('*');
      await Array.fromAsync(glob.scan({ cwd: this.#dir }));
    } catch {
      // Create directory by writing a .keep file
      await Bun.write(`${this.#dir}/.keep`, '');
      this.logs.info('automations.dir.created', { dir: this.#dir });
    }

    // Load all .yml/.yaml files using Bun.Glob
    const glob = new Bun.Glob('*.{yml,yaml}');
    const yamlFiles = await Array.fromAsync(glob.scan({ cwd: this.#dir }));

    for (const file of yamlFiles) {
      await this.#loadFile(`${this.#dir}/${file}`);
    }

    this.logs.info('automations.loaded', {
      dir: this.#dir,
      count: this.#loaded.size,
    });
  }

  /**
   * Start watching for file changes using Bun polling
   */
  watch(): void {
    if (!this.#dir) {
      throw new Error('Call loadDir() before watch()');
    }

    // Use polling-based watching with Bun.Glob
    this.#watcher = setInterval(async () => {
      if (!this.#dir) return;

      try {
        const glob = new Bun.Glob('*.{yml,yaml}');
        const currentFiles = new Set<string>();

        for await (const file of glob.scan({ cwd: this.#dir })) {
          const filePath = `${this.#dir}/${file}`;
          currentFiles.add(filePath);

          const bunFile = Bun.file(filePath);
          const newHash = Number(Bun.hash(await bunFile.text()));
          const oldHash = this.#fileHashes.get(filePath);

          if (oldHash !== newHash) {
            this.#fileHashes.set(filePath, newHash);

            // Debounce rapid changes
            const existing = this.#debounce.get(filePath);
            if (existing) clearTimeout(existing);

            this.#debounce.set(
              filePath,
              setTimeout(async () => {
                this.#debounce.delete(filePath);
                await this.#loadFile(filePath);
              }, 100)
            );
          }
        }

        // Check for deleted files
        for (const [filePath] of this.#fileHashes) {
          if (!currentFiles.has(filePath)) {
            this.#fileHashes.delete(filePath);
            this.#unloadFile(filePath);
          }
        }
      } catch (e) {
        this.logs.error('automations.watch.error', { error: String(e) } as Record<string, Json>);
      }
    }, 1000); // Poll every second

    this.logs.info('automations.watching', { dir: this.#dir });
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    if (this.#watcher) {
      clearInterval(this.#watcher);
      this.#watcher = null;
    }
  }

  /**
   * Save a workflow to YAML
   */
  async saveWorkflow(workflow: Workflow): Promise<string> {
    if (!this.#dir) {
      throw new Error('Call loadDir() before saveWorkflow()');
    }

    // Generate filename from workflow ID
    const fileName = `${workflow.id}.yml`;
    const filePath = `${this.#dir}/${fileName}`;

    // Write as YAML using Bun's built-in YAML support
    await Bun.write(filePath, Bun.YAML.stringify(workflow));

    // Update mappings
    this.#loaded.set(filePath, workflow.id);
    this.#idToFile.set(workflow.id, filePath);

    // Register/update workflow
    this.engine.register(workflow);

    this.logs.info('automations.file.saved', {
      file: fileName,
      id: workflow.id,
    } as Record<string, Json>);

    return filePath;
  }

  /**
   * Delete a workflow by ID
   */
  async deleteWorkflow(id: string): Promise<boolean> {
    const filePath = this.#idToFile.get(id);
    if (!filePath) {
      // Try to find file by convention
      if (this.#dir) {
        const conventionalPath = `${this.#dir}/${id}.yml`;
        const file = Bun.file(conventionalPath);
        if (await file.exists()) {
          const proc = Bun.spawn(['rm', conventionalPath]);
          await proc.exited;
          this.engine.unregister(id);
          this.logs.info('automations.file.deleted', { id } as Record<string, Json>);
          return true;
        }
      }
      return false;
    }

    // Delete file using Bun
    const proc = Bun.spawn(['rm', filePath]);
    await proc.exited;
    if (proc.exitCode !== 0) {
      this.logs.error('automations.file.delete.error', {
        file: filePath,
        error: `Failed to delete file: exit code ${proc.exitCode}`,
      } as Record<string, Json>);
      return false;
    }

    // Clean up mappings
    this.#loaded.delete(filePath);
    this.#idToFile.delete(id);

    // Unregister workflow
    this.engine.unregister(id);

    const fileName = filePath.split('/').pop() ?? filePath;
    this.logs.info('automations.file.deleted', {
      file: fileName,
      id,
    } as Record<string, Json>);

    return true;
  }

  /**
   * Load a single YAML file
   */
  async #loadFile(filePath: string): Promise<void> {
    // Unload previous workflow from this file
    this.#unloadFile(filePath);

    try {
      const workflow = (await import(filePath, {
        with: { type: 'yaml' },
      })) as Workflow;
      if (!workflow?.id) {
        this.logs.warn('automations.file.invalid', { file: filePath, reason: 'missing id' });
        return;
      }

      this.engine.register(workflow);
      this.#loaded.set(filePath, workflow.id);
      this.#idToFile.set(workflow.id, filePath);

      const fileName = filePath.split('/').pop() ?? filePath;
      this.logs.info('automations.file.loaded', {
        file: fileName,
        id: workflow.id,
      } as Record<string, Json>);
    } catch (error) {
      const fileName = filePath.split('/').pop() ?? filePath;
      this.logs.error('automations.file.error', {
        file: fileName,
        error: String(error),
      } as Record<string, Json>);
    }
  }

  /**
   * Unload workflow from a file
   */
  #unloadFile(filePath: string): void {
    const workflowId = this.#loaded.get(filePath);
    if (!workflowId) return;

    this.engine.unregister(workflowId);
    this.#loaded.delete(filePath);
    this.#idToFile.delete(workflowId);

    const fileName = filePath.split('/').pop() ?? filePath;
    this.logs.info('automations.file.unloaded', {
      file: fileName,
      id: workflowId,
    } as Record<string, Json>);
  }
}
