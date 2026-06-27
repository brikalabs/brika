/**
 * Board Loader
 *
 * Loads board layouts from YAML files with hot-reload support.
 * Follows the WorkflowLoader pattern.
 */

import { watch } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Analytics } from '@brika/analytics';
import { inject, singleton } from '@brika/di';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { JsonStateFile } from '@/runtime/fs/json-state-file';
import { Logger } from '@/runtime/logs/log-router';
import { ensureAndScanYamlDir } from '@/runtime/utils/yaml-dir';
import type { Json } from '@/types';

/** The board-order index is a plain ordered list of board IDs. */
const BoardOrderSchema = z.array(z.string());

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
  readonly #analytics = inject(Analytics);

  #dir: string | null = null;
  /** Dir holding the machine-managed `board-order.json` (the hidden `.system/`). */
  #orderDir: string | null = null;
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

  async loadDir(dir: string, orderDir?: string): Promise<void> {
    this.#dir = dir;
    // The board files live in the visible `boards/` dir; the ordering index is
    // machine-managed and lives under the hidden `.system/`. Tests that pass no
    // orderDir keep the legacy "parent of boards dir" location.
    this.#orderDir = orderDir ?? dirname(dir);

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
    this.#loadOrder();

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
      this.#persistOrder();
    }

    // Discrete lifecycle: a new board is created. Plain saves (every brick
    // move / config write also call saveBoard) are intentionally skipped to
    // avoid flooding on layout churn.
    if (isNew) {
      this.#analytics.capture('board.created', {
        boardId: board.id,
        hasIcon: board.icon !== undefined,
        columns: board.columns,
      });
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
    this.#persistOrder();

    for (const l of this.#changeListeners) {
      l(id, 'unload');
    }

    this.#analytics.capture('board.deleted', { boardId: id });

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

  reorder(ids: string[]): boolean {
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
    this.#persistOrder();

    this.#analytics.capture('board.reordered', { count: this.#order.length });

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

      // Reject a second file reusing an id another file already owns (would let
      // one file's unload tear down the other's board). First file on disk wins.
      const owner = this.#idToFile.get(board.id);
      if (owner !== undefined && owner !== filePath) {
        this.logs.warn('Duplicate board id across files; ignoring the second', {
          boardId: board.id,
          keptFile: basename(owner),
          ignoredFile: basename(filePath),
        });
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

    this.#loaded.delete(filePath);
    // Only tear down the board if THIS file owns the id, so unloading one file
    // never removes (or fires a spurious 'unload' for) another file's board.
    if (this.#idToFile.get(boardId) === filePath) {
      this.#boards.delete(boardId);
      this.#idToFile.delete(boardId);
      for (const l of this.#changeListeners) {
        l(boardId, 'unload');
      }
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

  #orderFile(): JsonStateFile<string[]> {
    // Machine-managed ordering index, kept under the hidden `.system/` dir
    // (falls back to the boards' parent dir when loadDir got no orderDir).
    const path = join(this.#orderDir ?? dirname(this.#dir ?? ''), 'board-order.json');
    return new JsonStateFile(path, { schema: BoardOrderSchema });
  }

  #loadOrder(): void {
    const saved = this.#orderFile().load();
    if (saved) {
      // Keep only IDs that still exist, then append any boards not in the saved order.
      this.#order = saved.filter((id) => this.#boards.has(id));
      for (const id of this.#boards.keys()) {
        if (!this.#order.includes(id)) {
          this.#order.push(id);
        }
      }
      return;
    }
    // No (or invalid) saved order: use current map iteration order.
    this.#order = [...this.#boards.keys()];
  }

  #persistOrder(): void {
    try {
      this.#orderFile().persist(this.#order);
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
