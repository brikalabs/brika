/**
 * YAML Workflow Loader
 * 
 * Loads workflows from YAML files with hot-reload support.
 */

import { singleton, inject, type Json } from "@elia/shared";
import type { Workflow } from "@elia/sdk";
import { LogRouter } from "../logs/log-router";
import { AutomationEngine } from "./automation-engine";
import { parse, stringify } from "yaml";
import { watch, type FSWatcher } from "node:fs";
import { readdir, mkdir, unlink } from "node:fs/promises";

@singleton()
export class YamlWorkflowLoader {
  private readonly logs = inject(LogRouter);
  private readonly engine = inject(AutomationEngine);

  #dir: string | null = null;
  #watcher: FSWatcher | null = null;
  #loaded = new Map<string, string>(); // file -> workflow ID
  #idToFile = new Map<string, string>(); // workflow ID -> file
  #debounce = new Map<string, ReturnType<typeof setTimeout>>();

  get dir(): string | null {
    return this.#dir;
  }

  /**
   * Load all workflows from a directory
   */
  async loadDir(dir: string): Promise<void> {
    this.#dir = dir;
    
    // Ensure directory exists
    try {
      await readdir(this.#dir);
    } catch {
      await mkdir(this.#dir, { recursive: true });
      this.logs.info("automations.dir.created", { dir: this.#dir });
    }

    // Load all .yml/.yaml files
    const files = await readdir(this.#dir);
    const yamlFiles = files.filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
    
    for (const file of yamlFiles) {
      await this.#loadFile(`${this.#dir}/${file}`);
    }

    this.logs.info("automations.loaded", { 
      dir: this.#dir, 
      count: this.#loaded.size,
    });
  }

  /**
   * Start watching for file changes
   */
  watch(): void {
    if (!this.#dir) {
      throw new Error("Call loadDir() before watch()");
    }

    this.#watcher = watch(this.#dir, (_event: string, filename: string | null) => {
      if (!filename) return;
      if (!filename.endsWith(".yml") && !filename.endsWith(".yaml")) return;

      const filePath = `${this.#dir}/${filename}`;
      
      // Debounce rapid changes
      const existing = this.#debounce.get(filePath);
      if (existing) clearTimeout(existing);
      
      this.#debounce.set(filePath, setTimeout(async () => {
        this.#debounce.delete(filePath);
        
        const file = Bun.file(filePath);
        if (await file.exists()) {
          await this.#loadFile(filePath);
        } else {
          this.#unloadFile(filePath);
        }
      }, 100));
    });

    this.logs.info("automations.watching", { dir: this.#dir });
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    this.#watcher?.close();
    this.#watcher = null;
  }

  /**
   * Save a workflow to YAML
   */
  async saveWorkflow(workflow: Workflow): Promise<string> {
    if (!this.#dir) {
      throw new Error("Call loadDir() before saveWorkflow()");
    }

    // Generate filename from workflow ID
    const fileName = `${workflow.id}.yml`;
    const filePath = `${this.#dir}/${fileName}`;

    // Convert to YAML with nice formatting
    const yamlContent = stringify(workflow, {
      indent: 2,
      lineWidth: 120,
    });

    // Write file
    await Bun.write(filePath, yamlContent);

    // Update mappings
    this.#loaded.set(filePath, workflow.id);
    this.#idToFile.set(workflow.id, filePath);

    // Register/update workflow
    this.engine.register(workflow);

    this.logs.info("automations.file.saved", { 
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
          await unlink(conventionalPath);
          this.engine.unregister(id);
          this.logs.info("automations.file.deleted", { id } as Record<string, Json>);
          return true;
        }
      }
      return false;
    }

    // Delete file
    try {
      await unlink(filePath);
    } catch (e) {
      this.logs.error("automations.file.delete.error", { 
        file: filePath, 
        error: String(e),
      } as Record<string, Json>);
      return false;
    }

    // Clean up mappings
    this.#loaded.delete(filePath);
    this.#idToFile.delete(id);

    // Unregister workflow
    this.engine.unregister(id);

    const fileName = filePath.split("/").pop() ?? filePath;
    this.logs.info("automations.file.deleted", { 
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
      const file = Bun.file(filePath);
      const content = await file.text();
      const workflow = parse(content) as Workflow;

      if (!workflow?.id) {
        this.logs.warn("automations.file.invalid", { file: filePath, reason: "missing id" });
        return;
      }

      this.engine.register(workflow);
      this.#loaded.set(filePath, workflow.id);
      this.#idToFile.set(workflow.id, filePath);
      
      const fileName = filePath.split("/").pop() ?? filePath;
      this.logs.info("automations.file.loaded", { 
        file: fileName, 
        id: workflow.id,
      } as Record<string, Json>);
    } catch (error) {
      const fileName = filePath.split("/").pop() ?? filePath;
      this.logs.error("automations.file.error", { 
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
    
    const fileName = filePath.split("/").pop() ?? filePath;
    this.logs.info("automations.file.unloaded", { 
      file: fileName, 
      id: workflowId,
    } as Record<string, Json>);
  }

  /**
   * Get loaded files info
   */
  getLoadedFiles(): Array<{ file: string; workflowId: string }> {
    return [...this.#loaded.entries()].map(([file, id]) => ({
      file: file.split("/").pop() ?? file,
      workflowId: id,
    }));
  }
}
