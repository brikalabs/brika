/**
 * Dashboard Loader
 *
 * Loads dashboard layouts from YAML files with hot-reload support.
 * Follows the WorkflowLoader pattern.
 */

import { watch } from 'node:fs';
import { basename, join } from 'node:path';
import { inject, singleton } from '@brika/di';
import type { Json } from '@brika/shared';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { Logger } from '@/runtime/logs/log-router';
import type { Dashboard, DashboardBrickPlacement } from './types';

const YAML_OPTIONS = {
  indent: 2,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
} as const;

const isYAMLFile = (name: string) => name.endsWith('.yaml') || name.endsWith('.yml');

// ─────────────────────────────────────────────────────────────────────────────
// YAML Schema
// ─────────────────────────────────────────────────────────────────────────────

const YAMLBrickSchema = z.object({
  instanceId: z.string(),
  type: z.string(),
  family: z.string().optional(), // legacy — ignored on load
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ w: z.number(), h: z.number() }),
});

const YAMLDashboardSchema = z.object({
  version: z.optional(z.string()),
  dashboard: z.object({
    id: z.string(),
    name: z.string(),
    icon: z.optional(z.string()),
    columns: z.optional(z.number()),
  }),
  bricks: z.optional(z.array(YAMLBrickSchema)),
});

type YAMLDashboard = z.output<typeof YAMLDashboardSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class DashboardLoader {
  private readonly logs = inject(Logger).withSource('state');

  #dir: string | null = null;
  #watcher: ReturnType<typeof watch> | null = null;
  readonly #loaded = new Map<string, string>(); // filePath -> dashboardId
  readonly #idToFile = new Map<string, string>(); // dashboardId -> filePath
  readonly #dashboards = new Map<string, Dashboard>();
  readonly #skipWatchPaths = new Set<string>(); // files we just saved — ignore watcher

  /** Listeners called when dashboards change */
  readonly #changeListeners = new Set<(id: string, action: 'load' | 'unload') => void>();

  onChange(listener: (id: string, action: 'load' | 'unload') => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  async loadDir(dir: string): Promise<void> {
    this.#dir = dir;

    // Ensure directory exists
    try {
      await Array.fromAsync(new Bun.Glob('*').scan({ cwd: dir }));
    } catch {
      await Bun.write(`${dir}/.keep`, '');
      this.logs.info('Dashboards directory created', { directory: dir });
    }

    // Load all YAML files
    const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: dir }));
    for (const file of files) await this.#loadFile(join(dir, file));

    // Create default "Home" dashboard if none exist
    if (this.#dashboards.size === 0) {
      const home: Dashboard = {
        id: 'home',
        name: 'Home',
        icon: 'home',
        columns: 12,
        bricks: [],
      };
      await this.saveDashboard(home);
    }

    this.logs.info('Dashboard files loaded', { directory: dir, count: this.#dashboards.size });
  }

  watch(): void {
    if (!this.#dir) throw new Error('Call loadDir() before watch()');
    if (this.#watcher) return;

    const dir = this.#dir;
    this.#watcher = watch(dir, { recursive: false }, (_event, filename) => {
      if (!filename || !isYAMLFile(String(filename))) return;

      void (async () => {
        const filePath = join(dir, String(filename));

        // Skip events triggered by our own saveDashboard() calls
        if (this.#skipWatchPaths.has(filePath)) return;

        if (await Bun.file(filePath).exists()) {
          await this.#loadFile(filePath);
        } else {
          this.#unloadFile(filePath);
        }
      })();
    });

    this.logs.info('Started watching dashboard files', { directory: dir });
  }

  stopWatching(): void {
    this.#watcher?.close();
    this.#watcher = null;
  }

  async saveDashboard(dashboard: Dashboard): Promise<string> {
    if (!this.#dir) throw new Error('Call loadDir() first');

    const filePath = this.#idToFile.get(dashboard.id) ?? `${this.#dir}/${dashboard.id}.yaml`;

    // Prevent the file watcher from re-loading what we just saved
    this.#skipWatchPaths.add(filePath);
    await Bun.write(filePath, stringifyYAML(this.#toYAML(dashboard), YAML_OPTIONS));
    setTimeout(() => this.#skipWatchPaths.delete(filePath), 1000);

    this.#loaded.set(filePath, dashboard.id);
    this.#idToFile.set(dashboard.id, filePath);
    this.#dashboards.set(dashboard.id, dashboard);

    this.logs.info('Dashboard saved', { fileName: basename(filePath), dashboardId: dashboard.id });
    return filePath;
  }

  async deleteDashboard(id: string): Promise<boolean> {
    if (!this.#dir) throw new Error('Call loadDir() first');

    const filePath = this.#idToFile.get(id) ?? `${this.#dir}/${id}.yaml`;
    if (!(await Bun.file(filePath).exists())) return false;

    const proc = Bun.spawn(['rm', filePath]);
    await proc.exited;
    if (proc.exitCode !== 0) return false;

    this.#loaded.delete(filePath);
    this.#idToFile.delete(id);
    this.#dashboards.delete(id);

    for (const l of this.#changeListeners) l(id, 'unload');

    this.logs.info('Dashboard deleted', { fileName: basename(filePath), dashboardId: id });
    return true;
  }

  get(id: string): Dashboard | undefined {
    return this.#dashboards.get(id);
  }

  list(): Dashboard[] {
    return [...this.#dashboards.values()];
  }

  async #loadFile(filePath: string): Promise<void> {
    this.#unloadFile(filePath);

    try {
      const yaml = parseYAML(await Bun.file(filePath).text());
      const dashboard = this.#fromYAML(yaml);
      if (!dashboard) return;

      this.#dashboards.set(dashboard.id, dashboard);
      this.#loaded.set(filePath, dashboard.id);
      this.#idToFile.set(dashboard.id, filePath);

      for (const l of this.#changeListeners) l(dashboard.id, 'load');

      this.logs.info('Dashboard loaded', { fileName: basename(filePath), dashboardId: dashboard.id });
    } catch (error) {
      this.logs.error('Failed to load dashboard', { fileName: basename(filePath) }, { error });
    }
  }

  #unloadFile(filePath: string): void {
    const dashboardId = this.#loaded.get(filePath);
    if (!dashboardId) return;

    this.#dashboards.delete(dashboardId);
    this.#loaded.delete(filePath);
    this.#idToFile.delete(dashboardId);

    for (const l of this.#changeListeners) l(dashboardId, 'unload');
  }

  #fromYAML(yaml: unknown): Dashboard | null {
    const result = YAMLDashboardSchema.safeParse(yaml);
    if (!result.success) return null;

    const { dashboard, bricks: yamlBricks = [] } = result.data;
    const bricks: DashboardBrickPlacement[] = yamlBricks.map((c) => ({
      instanceId: c.instanceId,
      brickTypeId: c.type,
      config: (c.config ?? {}) as Record<string, Json>,
      position: c.position,
      size: c.size,
    }));

    return {
      id: dashboard.id,
      name: dashboard.name,
      icon: dashboard.icon,
      columns: dashboard.columns ?? 12,
      bricks,
    };
  }

  #toYAML(dashboard: Dashboard): YAMLDashboard {
    return {
      version: '1',
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        icon: dashboard.icon,
        columns: dashboard.columns,
      },
      bricks: dashboard.bricks.map((c) => ({
        instanceId: c.instanceId,
        type: c.brickTypeId,
        config: Object.keys(c.config).length > 0 ? c.config : undefined,
        position: c.position,
        size: c.size,
      })),
    };
  }
}
