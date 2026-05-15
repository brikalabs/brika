/**
 * Sprite primitives — the layer-and-grid model behind the multi-line
 * Brix stage. A `Sprite` is a rectangular grid of `Cell | null` rows,
 * where `null` marks a transparent cell that lets a lower layer show
 * through. Everything more complex (timelines, particles, the stage
 * itself) eventually renders down to a composed Sprite.
 *
 *   const body = parseSprite(`
 *     ··.---.··
 *     ·(·····)·
 *     ··'---'··
 *   `);                             //  9×3 grid, edges transparent
 *   const face = parseSprite('◕◡◕'); //  1×3 face glyphs
 *   const brix = compose([body, { sprite: face, x: 3, y: 1 }]);
 *
 * The author-facing convention: `·` (middle dot, U+00B7) reads as
 * transparent. Any other char is opaque. The transparent character is
 * configurable per-parse.
 */

export interface Cell {
  readonly ch: string;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

export type SpriteRow = ReadonlyArray<Cell | null>;

export interface Sprite {
  readonly rows: ReadonlyArray<SpriteRow>;
  readonly width: number;
  readonly height: number;
}

export interface ParseOptions {
  /** Character that marks a transparent cell. Default `·` (U+00B7). */
  readonly transparent?: string;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

export interface LayerPlacement {
  readonly sprite: Sprite;
  /** Column offset on the target canvas. */
  readonly x?: number;
  /** Row offset on the target canvas. */
  readonly y?: number;
  /** When set, every opaque cell from this layer is recolored. */
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

export type LayerInput = Sprite | LayerPlacement;

export interface CanvasSize {
  readonly width?: number;
  readonly height?: number;
}

const DEFAULT_TRANSPARENT = '·';

export const EMPTY_SPRITE: Sprite = Object.freeze({ rows: [], width: 0, height: 0 });

/** Strip the leading/trailing blank line if present and dedent by the
 *  smallest common leading-space prefix. */
function trimAndDedent(input: string): string[] {
  const lines = input.split('\n');
  if (lines[0]?.trim() === '') {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    const lead = /^ */.exec(line)?.[0].length ?? 0;
    if (lead < min) {
      min = lead;
    }
  }
  if (min === Number.POSITIVE_INFINITY) {
    min = 0;
  }
  return lines.map((line) => line.slice(min));
}

export function parseSprite(input: string, opts: ParseOptions = {}): Sprite {
  const lines = trimAndDedent(input);
  const transparent = opts.transparent ?? DEFAULT_TRANSPARENT;
  const rows: (Cell | null)[][] = [];
  let width = 0;
  for (const line of lines) {
    const chars = Array.from(line);
    const row: (Cell | null)[] = [];
    for (const ch of chars) {
      if (ch === transparent) {
        row.push(null);
      } else {
        row.push({ ch, color: opts.color, dim: opts.dim, bold: opts.bold });
      }
    }
    rows.push(row);
    if (row.length > width) {
      width = row.length;
    }
  }
  for (const row of rows) {
    while (row.length < width) {
      row.push(null);
    }
  }
  return { rows, width, height: rows.length };
}

function normalize(layer: LayerInput): LayerPlacement {
  return 'sprite' in layer ? layer : { sprite: layer };
}

function applyOverrides(cell: Cell, p: LayerPlacement): Cell {
  if (p.color === undefined && p.dim === undefined && p.bold === undefined) {
    return cell;
  }
  return {
    ch: cell.ch,
    color: p.color ?? cell.color,
    dim: p.dim ?? cell.dim,
    bold: p.bold ?? cell.bold,
  };
}

function makeGrid(width: number, height: number): (Cell | null)[][] {
  const out: (Cell | null)[][] = [];
  for (let r = 0; r < height; r += 1) {
    const row: (Cell | null)[] = [];
    for (let c = 0; c < width; c += 1) {
      row.push(null);
    }
    out.push(row);
  }
  return out;
}

/**
 * Stack layers from bottom (first) to top (last). Opaque cells in
 * higher layers overwrite whatever the lower layers painted. If
 * `size` is provided, the canvas is exactly that size and out-of-
 * bounds cells are clipped; otherwise the canvas grows to fit.
 */
export function compose(layers: ReadonlyArray<LayerInput>, size: CanvasSize = {}): Sprite {
  const placements = layers.map(normalize);
  let width = size.width ?? 0;
  let height = size.height ?? 0;
  if (size.width === undefined || size.height === undefined) {
    for (const p of placements) {
      const x = p.x ?? 0;
      const y = p.y ?? 0;
      if (size.width === undefined && x + p.sprite.width > width) {
        width = x + p.sprite.width;
      }
      if (size.height === undefined && y + p.sprite.height > height) {
        height = y + p.sprite.height;
      }
    }
  }
  const grid = makeGrid(width, height);
  for (const p of placements) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    for (let r = 0; r < p.sprite.height; r += 1) {
      const targetRow = grid[y + r];
      const sourceRow = p.sprite.rows[r];
      if (!targetRow || !sourceRow) {
        continue;
      }
      for (let c = 0; c < p.sprite.width; c += 1) {
        const cell = sourceRow[c];
        if (!cell) {
          continue;
        }
        const tc = x + c;
        if (tc < 0 || tc >= width) {
          continue;
        }
        targetRow[tc] = applyOverrides(cell, p);
      }
    }
  }
  return { rows: grid, width, height };
}

/** Recolor every opaque cell. Cheap — allocates one new Sprite. */
export function tint(sprite: Sprite, color: string): Sprite {
  const rows: (Cell | null)[][] = sprite.rows.map((row) =>
    row.map((c): Cell | null => (c ? { ch: c.ch, color, dim: c.dim, bold: c.bold } : null))
  );
  return { rows, width: sprite.width, height: sprite.height };
}

/** Shift a sprite by (dx, dy). Returns a Placement so a composer can
 *  put it on any canvas without re-allocating cells. */
export function translate(sprite: Sprite, dx: number, dy: number): LayerPlacement {
  return { sprite, x: dx, y: dy };
}
