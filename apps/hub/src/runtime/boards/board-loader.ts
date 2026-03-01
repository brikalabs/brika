/**
 * Board Loader
 *
 * Loads board layouts from YAML files with hot-reload support.
 * Follows the WorkflowLoader pattern.
 */

import { watch } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { inject, singleton } from '@brika/di';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { Logger } from '@/runtime/logs/log-router';
import { ensureAndScanYamlDir } from '@/runtime/utils/yaml-dir';
import type { Json } from '@/types';
import type { Board, BoardBrickPlacement } from './types';

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
  label: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  size: z.object({
    w: z.number(),
    h: z.number(),
  }),
});

const YAMLBoardSchema = z.object({
  version: z.optional(z.string()),
  board: z.object({
    id: z.string(),
    name: z.string(),
    icon: z.optional(z.string()),
    columns: z.optional(z.number()),
  }),
  bricks: z.optional(z.array(YAMLBrickSchema)),
});

type YAMLBoard = z.output<typeof YAMLBoardSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BoardLoader {
  private readonly logs = inject(Logger).withSource('state');

  #dir: string | null = null;
  #watcher: ReturnType<typeof watch> | null = null;
  readonly #loaded = new Map<string, string>(); // filePath -> boardId
  readonly #idToFile = new Map<string, string>(); // boardId -> filePath
  readonly #boards = new Map<string, Board>();
  readonly #skipWatchPaths = new Set<string>(); // files we just saved — ignore watcher
  #order: string[] = []; // ordered board IDs

  /** Listeners called when boards change */
  readonly #changeListeners = new Set<(id: string, action: 'load' | 'unload') => void>();

  onChange(listener: (id: string, action: 'load' | 'unload') => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  async loadDir(dir: string): Promise<void> {
    this.#dir = dir;

    const filePaths = await ensureAndScanYamlDir(dir, this.logs, 'Boards');
    for (const filePath of filePaths) {
      await this.#loadFile(filePath);
    }

    // Create default "Home" board if none exist
    if (this.#boards.size === 0) {
      const home: Board = {
        id: 'home',
        name: 'Home',
        icon: 'home',
        columns: 12,
        bricks: [],
      };
      await this.saveBoard(home);
    }

    // Load order from file, falling back to current map iteration order
    await this.#loadOrder();

    this.logs.info('Board files loaded', {
      directory: dir,
      count: this.#boards.size,
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
        if (!filename || !isYAMLFile(String(filename))) {
          return;
        }

        void (async () => {
          const filePath = join(dir, String(filename));

          // Skip events triggered by our own saveBoard() calls
          if (this.#skipWatchPaths.has(filePath)) {
            return;
          }

          if (await Bun.file(filePath).exists()) {
            await this.#loadFile(filePath);
          } else {
            this.#unloadFile(filePath);
          }
        })();
      }
    );

    this.logs.info('Started watching board files', {
      directory: dir,
    });
  }

  stopWatching(): void {
    this.#watcher?.close();
    this.#watcher = null;
  }

  async saveBoard(board: Board): Promise<string> {
    if (!this.#dir) {
      throw new Error('Call loadDir() first');
    }

    const isNew = !this.#boards.has(board.id);
    const filePath = this.#idToFile.get(board.id) ?? `${this.#dir}/${board.id}.yaml`;

    // Prevent the file watcher from re-loading what we just saved
    this.#skipWatchPaths.add(filePath);
    await Bun.write(filePath, stringifyYAML(this.#toYAML(board), YAML_OPTIONS));
    setTimeout(() => this.#skipWatchPaths.delete(filePath), 1000);

    this.#loaded.set(filePath, board.id);
    this.#idToFile.set(board.id, filePath);
    this.#boards.set(board.id, board);

    // Append new boards to the end of the order
    if (isNew && !this.#order.includes(board.id)) {
      this.#order.push(board.id);
      await this.#persistOrder();
    }

    this.logs.info('Board saved', {
      fileName: basename(filePath),
      boardId: board.id,
    });
    return filePath;
  }

  async deleteBoard(id: string): Promise<boolean> {
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
    this.#boards.delete(id);

    // Remove from order
    this.#order = this.#order.filter((oid) => oid !== id);
    await this.#persistOrder();

    for (const l of this.#changeListeners) {
      l(id, 'unload');
    }

    this.logs.info('Board deleted', {
      fileName: basename(filePath),
      boardId: id,
    });
    return true;
  }

  get(id: string): Board | undefined {
    return this.#boards.get(id);
  }

  list(): Board[] {
    const ordered: Board[] = [];
    for (const id of this.#order) {
      const d = this.#boards.get(id);
      if (d) {
        ordered.push(d);
      }
    }
    // Include any boards not yet in the order (e.g. loaded via file watcher)
    for (const d of this.#boards.values()) {
      if (!this.#order.includes(d.id)) {
        ordered.push(d);
      }
    }
    return ordered;
  }

  async reorder(ids: string[]): Promise<boolean> {
    // Validate: all provided IDs must exist
    for (const id of ids) {
      if (!this.#boards.has(id)) {
        return false;
      }
    }
    this.#order = ids;
    // Append any existing boards not in the provided list
    for (const id of this.#boards.keys()) {
      if (!this.#order.includes(id)) {
        this.#order.push(id);
      }
    }
    await this.#persistOrder();
    return true;
  }

  async #loadFile(filePath: string): Promise<void> {
    this.#unloadFile(filePath);

    try {
      const yaml = parseYAML(await Bun.file(filePath).text());
      const board = this.#fromYAML(yaml);
      if (!board) {
        return;
      }

      this.#boards.set(board.id, board);
      this.#loaded.set(filePath, board.id);
      this.#idToFile.set(board.id, filePath);

      for (const l of this.#changeListeners) {
        l(board.id, 'load');
      }

      this.logs.info('Board loaded', {
        fileName: basename(filePath),
        boardId: board.id,
      });
    } catch (error) {
      this.logs.error(
        'Failed to load board',
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
    const boardId = this.#loaded.get(filePath);
    if (!boardId) {
      return;
    }

    this.#boards.delete(boardId);
    this.#loaded.delete(filePath);
    this.#idToFile.delete(boardId);

    for (const l of this.#changeListeners) {
      l(boardId, 'unload');
    }
  }

  #fromYAML(yaml: unknown): Board | null {
    const result = YAMLBoardSchema.safeParse(yaml);
    if (!result.success) {
      return null;
    }

    const { board, bricks: yamlBricks = [] } = result.data;
    const bricks: BoardBrickPlacement[] = yamlBricks.map((c) => ({
      instanceId: c.instanceId,
      brickTypeId: c.type,
      label: c.label,
      config: (c.config ?? {}) as Record<string, Json>,
      position: c.position,
      size: c.size,
    }));

    return {
      id: board.id,
      name: board.name,
      icon: board.icon,
      columns: board.columns ?? 12,
      bricks,
    };
  }

  #toYAML(board: Board): YAMLBoard {
    return {
      version: '1',
      board: {
        id: board.id,
        name: board.name,
        icon: board.icon,
        columns: board.columns,
      },
      bricks: board.bricks.map((c) => ({
        instanceId: c.instanceId,
        type: c.brickTypeId,
        label: c.label,
        config: Object.keys(c.config).length > 0 ? c.config : undefined,
        position: c.position,
        size: c.size,
      })),
    };
  }

  get #orderFilePath(): string {
    // Store order file in parent dir (e.g. .brika/board-order.json)
    return join(dirname(this.#dir ?? ''), 'board-order.json');
  }

  async #loadOrder(): Promise<void> {
    try {
      const file = Bun.file(this.#orderFilePath);
      if (await file.exists()) {
        const data = await file.json();
        if (Array.isArray(data)) {
          // Filter to only IDs that exist
          this.#order = data.filter((id) => typeof id === 'string' && this.#boards.has(id));
          // Append any boards not in the saved order
          for (const id of this.#boards.keys()) {
            if (!this.#order.includes(id)) {
              this.#order.push(id);
            }
          }
          return;
        }
      }
    } catch {
      // Ignore read errors, fall through to default order
    }
    // Default: use current map iteration order
    this.#order = [
      ...this.#boards.keys(),
    ];
  }

  async #persistOrder(): Promise<void> {
    try {
      await Bun.write(this.#orderFilePath, JSON.stringify(this.#order));
    } catch (error) {
      this.logs.error(
        'Failed to persist board order',
        {},
        {
          error,
        }
      );
    }
  }
}
