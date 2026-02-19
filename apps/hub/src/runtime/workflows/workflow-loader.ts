/**
 * Workflow Loader
 *
 * Loads workflows from YAML files with hot-reload support.
 */

import { watch } from 'node:fs';
import { basename, join } from 'node:path';
import { inject, singleton } from '@brika/di';
import type { Json } from '@brika/shared';
import { nonEmptyRecord, PositionSchema } from '@brika/shared';
import { parsePortRef } from '@brika/workflow';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';
import { ensureAndScanYamlDir } from '@/runtime/utils/yaml-dir';
import type { BlockConnection, Workflow, WorkflowBlock } from './types';
import { WorkflowEngine } from './workflow-engine';

const YAML_OPTIONS = {
  indent: 2,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
} as const;

const isYAMLFile = (name: string) => name.endsWith('.yaml') || name.endsWith('.yml');
const WATCH_EVENT_DEBOUNCE_MS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// YAML Schema
// ─────────────────────────────────────────────────────────────────────────────

const YAMLBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.optional(PositionSchema),
  config: nonEmptyRecord(z.record(z.string(), z.unknown())),
  inputs: nonEmptyRecord(z.record(z.string(), z.string())),
  outputs: nonEmptyRecord(z.record(z.string(), z.string())),
});

const YAMLWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.optional(z.string()),
  enabled: z.boolean(),
});

const YAMLWorkflowSchema = z.object({
  version: z.optional(z.string()),
  workspace: YAMLWorkspaceSchema,
  plugins: z.optional(z.record(z.string(), z.string())),
  blocks: z.optional(z.array(YAMLBlockSchema)),
});

type YAMLBlock = z.infer<typeof YAMLBlockSchema>;
type YAMLWorkflow = z.output<typeof YAMLWorkflowSchema>;

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
    for (const filePath of filePaths) await this.#loadFile(filePath);

    this.logs.info('Workflow files loaded', { directory: dir, count: this.#loaded.size });
  }

  watch(): void {
    if (!this.#dir) throw new Error('Call loadDir() before watch()');
    if (this.#watcher) return;

    const dir = this.#dir;
    this.#watcher = watch(dir, { recursive: false }, (_event, filename) => {
      void this.#handleWatchEvent(dir, filename);
    });

    this.logs.info('Started watching workflow files', { directory: dir });
  }

  stopWatching(): void {
    this.#watcher?.close();
    this.#watcher = null;
    for (const timer of this.#watchTimers.values()) clearTimeout(timer);
    this.#watchTimers.clear();
  }

  async saveWorkflow(workflow: Workflow): Promise<string> {
    if (!this.#dir) throw new Error('Call loadDir() first');

    const filePath = this.#idToFile.get(workflow.id) ?? `${this.#dir}/${workflow.id}.yaml`;
    await Bun.write(filePath, stringifyYAML(this.#toYAML(workflow), YAML_OPTIONS));

    this.#loaded.set(filePath, workflow.id);
    this.#idToFile.set(workflow.id, filePath);
    this.engine.register(workflow);

    this.logs.info('Workflow saved', { fileName: basename(filePath), workflowId: workflow.id });
    return filePath;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    if (!this.#dir) throw new Error('Call loadDir() first');

    const filePath = this.#idToFile.get(id) ?? `${this.#dir}/${id}.yaml`;
    if (!(await Bun.file(filePath).exists())) return false;

    const proc = Bun.spawn(['rm', filePath]);
    await proc.exited;
    if (proc.exitCode !== 0) return false;

    this.#loaded.delete(filePath);
    this.#idToFile.delete(id);
    this.engine.unregister(id);

    this.logs.info('Workflow deleted', { fileName: basename(filePath), workflowId: id });
    return true;
  }

  async #loadFile(filePath: string): Promise<void> {
    try {
      const content = await Bun.file(filePath).text();
      if (this.#fileContents.get(filePath) === content) return;

      this.#unloadFile(filePath);

      const yaml = parseYAML(content);
      const workflow = this.#fromYAML(yaml);
      if (!workflow) return;

      this.engine.register(workflow);
      this.#loaded.set(filePath, workflow.id);
      this.#idToFile.set(workflow.id, filePath);
      this.#fileContents.set(filePath, content);

      this.logs.info('Workflow loaded', { fileName: basename(filePath), workflowId: workflow.id });
    } catch (error) {
      this.logs.error('Failed to load workflow', { fileName: basename(filePath) }, { error });
    }
  }

  #unloadFile(filePath: string): void {
    const workflowId = this.#loaded.get(filePath);
    if (!workflowId) return;

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
    if (!isYAMLFile(fileName)) return;

    const filePath = join(dir, fileName);
    this.#scheduleWatchLoad(filePath);
  }

  async #rescanWatchedDir(dir: string): Promise<void> {
    const entries = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: dir }));
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
    if (existing) clearTimeout(existing);

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

  #fromYAML(yaml: unknown): Workflow | null {
    const result = YAMLWorkflowSchema.safeParse(yaml);
    if (!result.success) return null;

    const { workspace, blocks: yamlBlocks = [] } = result.data;
    const blocks: WorkflowBlock[] = yamlBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      position: block.position,
      config: block.config as Record<string, Json> | undefined,
    }));

    return {
      id: workspace.id,
      name: workspace.name ?? workspace.id,
      description: workspace.description,
      enabled: workspace.enabled,
      blocks,
      connections: this.#buildConnections(yamlBlocks),
    };
  }

  #buildConnections(blocks: YAMLBlock[]): BlockConnection[] {
    const connections: BlockConnection[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
      this.#parseOutputConnections(block, connections, seen);
      this.#parseInputConnections(block, connections, seen);
    }

    return connections;
  }

  #parseOutputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.outputs) return;

    for (const [fromPort, ref] of Object.entries(block.outputs)) {
      try {
        const { blockId: to, portId: toPort } = parsePortRef(ref as `${string}:${string}`);

        const key = `${block.id}:${fromPort}->${to}:${toPort}`;
        if (seen.has(key)) continue;

        seen.add(key);
        connections.push({ from: block.id, fromPort, to, toPort });
      } catch {
        // Skip invalid port references
        continue;
      }
    }
  }

  #parseInputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.inputs) return;

    for (const [toPort, ref] of Object.entries(block.inputs)) {
      try {
        const { blockId: from, portId: fromPort } = parsePortRef(ref as `${string}:${string}`);

        const key = `${from}:${fromPort}->${block.id}:${toPort}`;
        if (seen.has(key)) continue;

        seen.add(key);
        connections.push({ from, fromPort, to: block.id, toPort });
      } catch {
        // Skip invalid port references
        continue;
      }
    }
  }

  #toYAML(workflow: Workflow): YAMLWorkflow {
    const inputs = new Map<string, Record<string, string>>();
    const outputs = new Map<string, Record<string, string>>();

    // Build connection maps
    for (const conn of workflow.connections ?? []) {
      if (!conn.fromPort || !conn.toPort) continue;

      if (!outputs.has(conn.from)) outputs.set(conn.from, {});
      outputs.get(conn.from)![conn.fromPort] = `${conn.to}:${conn.toPort}`;

      if (!inputs.has(conn.to)) inputs.set(conn.to, {});
      inputs.get(conn.to)![conn.toPort] = `${conn.from}:${conn.fromPort}`;
    }

    // Build plugins list from block registry
    const plugins: Record<string, string> = {};

    for (const block of workflow.blocks) {
      const pluginInfo = this.blocks.getPluginInfo(block.type);
      if (!pluginInfo || plugins[pluginInfo.id]) continue;

      plugins[pluginInfo.id] = pluginInfo.version;
    }

    // Build and validate YAML structure
    return YAMLWorkflowSchema.parse({
      version: '1',
      workspace: {
        id: workflow.id,
        name: workflow.name ?? workflow.id,
        description: workflow.description,
        enabled: workflow.enabled,
      },
      blocks: workflow.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        config: block.config,
        inputs: inputs.get(block.id),
        outputs: outputs.get(block.id),
      })),
      plugins: Object.keys(plugins).length > 0 ? plugins : undefined,
    });
  }
}
