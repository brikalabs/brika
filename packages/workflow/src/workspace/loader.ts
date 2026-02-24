/**
 * Workspace Loader
 *
 * Load and watch YAML workspace files with hot-reload support.
 */

import { rm } from 'node:fs/promises';
import type { BlockTypeDefinition, Workflow } from '../types';
import { validateWorkspace } from '../validation';
import { parseWorkspaceFile, serializeWorkspace } from './parser';

/**
 * Block type registry for looking up block definitions.
 */
export interface BlockTypeRegistry {
  get(type: string): BlockTypeDefinition | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LoaderEvents {
  /** Called when a workflow is loaded or updated */
  onLoad?: (workflow: Workflow, filePath: string) => void;
  /** Called when a workflow is unloaded (file deleted) */
  onUnload?: (workflowId: string, filePath: string) => void;
  /** Called when validation errors occur */
  onError?: (error: string, filePath: string) => void;
  /** Called when validation warnings occur */
  onWarning?: (warnings: string[], filePath: string) => void;
}

export interface LoaderOptions {
  /** Directory to load workflows from */
  dir: string;
  /** Block type registry for validation */
  registry: BlockTypeRegistry;
  /** Event callbacks */
  events?: LoaderEvents;
  /** Polling interval for file watching (ms) */
  pollInterval?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads and watches YAML workspace files.
 */
export class WorkspaceLoader {
  readonly #dir: string;
  readonly #registry: BlockTypeRegistry;
  readonly #events: LoaderEvents;
  readonly #pollInterval: number;

  /** Loaded workflows by file path */
  readonly #loaded = new Map<string, Workflow>();
  /** File path to workflow ID mapping */
  readonly #pathToId = new Map<string, string>();
  /** Workflow ID to file path mapping */
  readonly #idToPath = new Map<string, string>();
  /** File hashes for change detection */
  readonly #fileHashes = new Map<string, number>();
  /** File watcher timer */
  #watcher: ReturnType<typeof setInterval> | null = null;

  constructor(options: LoaderOptions) {
    this.#dir = options.dir;
    this.#registry = options.registry;
    this.#events = options.events ?? {};
    this.#pollInterval = options.pollInterval ?? 1000;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load all workflows from the configured directory.
   */
  async loadAll(): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: Bun global type
    const Bun = (globalThis as any).Bun;
    if (!Bun) {
      throw new Error('WorkspaceLoader requires Bun runtime');
    }

    // Ensure directory exists
    try {
      const glob = new Bun.Glob('*');
      await Array.fromAsync(glob.scan({ cwd: this.#dir }));
    } catch {
      // Create directory
      await Bun.write(`${this.#dir}/.keep`, '');
    }

    // Load all .yaml files
    const glob = new Bun.Glob('*.{yaml,yml}');
    const files = await Array.fromAsync(glob.scan({ cwd: this.#dir }));

    for (const file of files) {
      await this.#loadFile(`${this.#dir}/${file}`);
    }
  }

  /**
   * Start watching for file changes.
   */
  watch(): void {
    if (this.#watcher) return;

    this.#watcher = setInterval(() => this.#pollForChanges(), this.#pollInterval);
  }

  /**
   * Stop watching for file changes.
   */
  stopWatching(): void {
    if (this.#watcher) {
      clearInterval(this.#watcher);
      this.#watcher = null;
    }
  }

  /**
   * Get a loaded workflow by ID.
   */
  get(id: string): Workflow | undefined {
    const path = this.#idToPath.get(id);
    return path ? this.#loaded.get(path) : undefined;
  }

  /**
   * List all loaded workflows.
   */
  list(): Workflow[] {
    return [...this.#loaded.values()];
  }

  /**
   * Save a workflow to file.
   */
  async save(workflow: Workflow): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: Bun global type
    const Bun = (globalThis as any).Bun;
    if (!Bun) {
      throw new Error('WorkspaceLoader requires Bun runtime');
    }

    const filePath =
      this.#idToPath.get(workflow.workspace.id) ?? `${this.#dir}/${workflow.workspace.id}.yaml`;

    // Validate before saving
    const validation = validateWorkspace(workflow, this.#registry);
    if (!validation.valid) {
      const errors = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Validation failed: ${errors}`);
    }

    // Serialize and write
    const content = serializeWorkspace(workflow);
    await Bun.write(filePath, content);

    // Update mappings
    this.#loaded.set(filePath, workflow);
    this.#pathToId.set(filePath, workflow.workspace.id);
    this.#idToPath.set(workflow.workspace.id, filePath);

    this.#events.onLoad?.(workflow, filePath);
  }

  /**
   * Delete a workflow by ID.
   */
  async delete(id: string): Promise<boolean> {
    const filePath = this.#idToPath.get(id);
    if (!filePath) return false;

    try {
      await rm(filePath, { force: true });
      this.#fileHashes.delete(filePath);
      this.#unloadFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  async #loadFile(filePath: string): Promise<void> {
    // Unload previous version
    this.#unloadFile(filePath);

    // Parse file
    const result = await parseWorkspaceFile(filePath);
    if (!result.ok) {
      this.#events.onError?.(result.error, filePath);
      return;
    }

    const workflow = result.workflow;

    // Validate workspace
    const validation = validateWorkspace(workflow, this.#registry);
    if (!validation.valid) {
      const errors = validation.errors.map((e) => e.message).join('; ');
      this.#events.onError?.(`Validation failed: ${errors}`, filePath);
      return;
    }

    if (validation.warnings.length > 0) {
      const warnings = validation.warnings.map((w) => w.message);
      this.#events.onWarning?.(warnings, filePath);
    }

    // Store workflow
    this.#loaded.set(filePath, workflow);
    this.#pathToId.set(filePath, workflow.workspace.id);
    this.#idToPath.set(workflow.workspace.id, filePath);

    this.#events.onLoad?.(workflow, filePath);
  }

  #unloadFile(filePath: string): void {
    const workflowId = this.#pathToId.get(filePath);
    if (!workflowId) return;

    this.#loaded.delete(filePath);
    this.#pathToId.delete(filePath);
    this.#idToPath.delete(workflowId);

    this.#events.onUnload?.(workflowId, filePath);
  }

  async #pollForChanges(): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: Bun global type
    const Bun = (globalThis as any).Bun;
    if (!Bun) return;

    try {
      const glob = new Bun.Glob('*.{yaml,yml}');
      const currentFiles = new Set<string>();

      for await (const file of glob.scan({ cwd: this.#dir })) {
        const filePath = `${this.#dir}/${file}`;
        currentFiles.add(filePath);

        // Check for changes
        const bunFile = Bun.file(filePath);
        const content = await bunFile.text();
        const hash = Number(Bun.hash(content));
        const oldHash = this.#fileHashes.get(filePath);

        if (oldHash !== hash) {
          this.#fileHashes.set(filePath, hash);
          await this.#loadFile(filePath);
        }
      }

      // Check for deleted files
      for (const filePath of this.#fileHashes.keys()) {
        if (!currentFiles.has(filePath)) {
          this.#fileHashes.delete(filePath);
          this.#unloadFile(filePath);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.#events.onError?.(`Watch error: ${message}`, this.#dir);
    }
  }
}
