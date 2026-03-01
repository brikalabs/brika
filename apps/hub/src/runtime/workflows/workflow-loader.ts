/**
 * Workflow Loader
 *
 * Loads workflows from YAML files with hot-reload support.
 */

import { watch } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { inject, singleton } from '@brika/di';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';
import { ensureAndScanYamlDir } from '@/runtime/utils/yaml-dir';
import type { Workflow } from './types';
import { WorkflowEngine } from './workflow-engine';
import { YAMLSerializer } from './yaml-serializer';

const isYAMLFile = (name: string) => name.endsWith('.yaml') || name.endsWith('.yml');
const WATCH_EVENT_DEBOUNCE_MS = 50;

@singleton()
export class WorkflowLoader {
  private readonly logs = inject(Logger).withSource('workflow');
  private readonly engine = inject(WorkflowEngine);
  private readonly blocks = inject(BlockRegistry);

  #dir: string | null = null;
  #watcher: ReturnType<typeof watch> | null = null;
  readonly #watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #loaded = new Map<string, string>();
  readonly #idToFile = new Map<string, string>();
  readonly #fileContents = new Map<string, string>();

  async loadDir(dir: string): Promise<void> {
    this.#dir = dir;

    const filePaths = await ensureAndScanYamlDir(dir, this.logs, 'Workflows');
    for (const filePath of filePaths) {
      await this.#loadFile(filePath);
    }

    this.logs.info('Workflow files loaded', {
      directory: dir,
      count: this.#loaded.size,
    });
  }

  watch(): void {
    if (!this.#dir) {
      throw new Error('Call loadDir() before watch()');
    }
    if (this.#watcher) {
      return;
    }

    const dir = this.#dir;
    this.#watcher = watch(
      dir,
      {
        recursive: false,
      },
      (_event, filename) => {
        void this.#handleWatchEvent(dir, filename);
      }
    );

    this.logs.info('Started watching workflow files', {
      directory: dir,
    });
  }

  stopWatching(): void {
    this.#watcher?.close();
    this.#watcher = null;
    for (const timer of this.#watchTimers.values()) {
      clearTimeout(timer);
    }
    this.#watchTimers.clear();
  }

  async saveWorkflow(workflow: Workflow): Promise<string> {
    if (!this.#dir) {
      throw new Error('Call loadDir() first');
    }

    const filePath = this.#idToFile.get(workflow.id) ?? `${this.#dir}/${workflow.id}.yaml`;
    const yaml = YAMLSerializer.toYAML(
      workflow,
      (blockType) => this.blocks.getPluginInfo(blockType) ?? null
    );
    await Bun.write(filePath, yaml);

    this.#loaded.set(filePath, workflow.id);
    this.#idToFile.set(workflow.id, filePath);
    this.engine.register(workflow);

    this.logs.info('Workflow saved', {
      fileName: basename(filePath),
      workflowId: workflow.id,
    });
    return filePath;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    if (!this.#dir) {
      throw new Error('Call loadDir() first');
    }

    const filePath = this.#idToFile.get(id) ?? `${this.#dir}/${id}.yaml`;
    if (!(await Bun.file(filePath).exists())) {
      return false;
    }

    await rm(filePath, {
      force: true,
    });

    this.#loaded.delete(filePath);
    this.#idToFile.delete(id);
    this.engine.unregister(id);

    this.logs.info('Workflow deleted', {
      fileName: basename(filePath),
      workflowId: id,
    });
    return true;
  }

  async #loadFile(filePath: string): Promise<void> {
    try {
      const content = await Bun.file(filePath).text();
      if (this.#fileContents.get(filePath) === content) {
        return;
      }

      this.#unloadFile(filePath);

      const workflow = YAMLSerializer.fromYAML(content);
      if (!workflow) {
        return;
      }

      this.engine.register(workflow);
      this.#loaded.set(filePath, workflow.id);
      this.#idToFile.set(workflow.id, filePath);
      this.#fileContents.set(filePath, content);

      this.logs.info('Workflow loaded', {
        fileName: basename(filePath),
        workflowId: workflow.id,
      });
    } catch (error) {
      this.logs.error(
        'Failed to load workflow',
        {
          fileName: basename(filePath),
        },
        {
          error,
        }
      );
    }
  }

  #unloadFile(filePath: string): void {
    const workflowId = this.#loaded.get(filePath);
    if (!workflowId) {
      return;
    }

    this.engine.unregister(workflowId);
    this.#loaded.delete(filePath);
    this.#idToFile.delete(workflowId);
  }

  async #handleWatchEvent(dir: string, filename: string | Buffer | null): Promise<void> {
    if (!filename) {
      await this.#rescanWatchedDir(dir);
      return;
    }

    const fileName = String(filename);
    if (!isYAMLFile(fileName)) {
      return;
    }

    const filePath = join(dir, fileName);
    this.#scheduleWatchLoad(filePath);
  }

  async #rescanWatchedDir(dir: string): Promise<void> {
    const entries = await Array.fromAsync(
      new Bun.Glob('*.{yaml,yml}').scan({
        cwd: dir,
      })
    );
    const filePaths = new Set(entries.map((entry) => join(dir, entry)));

    for (const filePath of filePaths) {
      this.#scheduleWatchLoad(filePath);
    }

    for (const loadedPath of this.#loaded.keys()) {
      if (!filePaths.has(loadedPath)) {
        this.#unloadFile(loadedPath);
        this.#fileContents.delete(loadedPath);
      }
    }
  }

  #scheduleWatchLoad(filePath: string): void {
    const existing = this.#watchTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.#watchTimers.delete(filePath);
      void this.#processWatchLoad(filePath);
    }, WATCH_EVENT_DEBOUNCE_MS);

    this.#watchTimers.set(filePath, timer);
  }

  async #processWatchLoad(filePath: string): Promise<void> {
    if (await Bun.file(filePath).exists()) {
      await this.#loadFile(filePath);

      // File-system watch can fire before writes finish under load.
      // Retry once if parsing/loading did not complete.
      if (!this.#loaded.has(filePath) && (await Bun.file(filePath).exists())) {
        await new Promise((resolve) => setTimeout(resolve, WATCH_EVENT_DEBOUNCE_MS));
        await this.#loadFile(filePath);
      }
      return;
    }

    this.#unloadFile(filePath);
    this.#fileContents.delete(filePath);
  }
}
