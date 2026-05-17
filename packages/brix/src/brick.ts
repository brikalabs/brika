/**
 * Procedural brick renderer. Given the physics state (centre, height
 * above floor, width, height) and a face glyph, draws a rounded-box
 * Brix into the stage canvas with his feet sitting on the floor row.
 *
 *   ╭───╮       ← top border, row = floor - h + 1 - feetY
 *   │^◡^│       ← face row, just below top
 *   ╰───╯       ← bottom border, anchored at floor row
 *
 * The visible floor line (when present) is no longer baked into the
 * body sprite — `<BrixStage floor>` composes it as a separate layer,
 * so consumers can opt out simply by setting `floor={false}` (no
 * re-compilation of emote frames required).
 *
 * Growing the body taller (h↑) does NOT push the feet through the
 * floor — the bottom stays at the floor row and the top rises. Same
 * principle for jumps: feetY > 0 lifts the entire body up by feetY
 * rows; the face follows automatically.
 *
 * Edge cases for face placement:
 *   - h = 2  → face overlays the top edge: `╭─◡─╮`
 *   - h = 3  → face sits on the single interior row
 *   - h ≥ 4  → face sits on the top interior row (closer to "eyes")
 */

import type { Cell, LayerInput, Sprite } from './sprite';
import { compose } from './sprite';

export interface StageGeom {
  readonly width: number;
  readonly height: number;
  /** Row index where the brick's feet rest when grounded. */
  readonly floorY: number;
}

export interface BrickRender {
  readonly cx: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly face: Sprite;
  readonly color?: string;
  readonly faceColor?: string;
}

function row(width: number, kind: 'top' | 'bottom' | 'side'): Cell[] {
  const cells: Cell[] = [];
  if (kind === 'side') {
    cells.push({ ch: '│' });
    for (let i = 0; i < width - 2; i += 1) {
      cells.push({ ch: ' ' });
    }
    cells.push({ ch: '│' });
    return cells;
  }
  cells.push({ ch: kind === 'top' ? '╭' : '╰' });
  for (let i = 0; i < width - 2; i += 1) {
    cells.push({ ch: '─' });
  }
  cells.push({ ch: kind === 'top' ? '╮' : '╯' });
  return cells;
}

function rowSprite(cells: ReadonlyArray<Cell>): Sprite {
  return { rows: [cells], width: cells.length, height: 1 };
}

/** Render Brix at the given physics state into a stage-sized sprite. */
export function renderBrick(brick: Readonly<BrickRender>, stage: Readonly<StageGeom>): Sprite {
  const w = Math.max(3, Math.round(brick.w));
  const h = Math.max(2, Math.round(brick.h));
  const feetRow = stage.floorY - Math.round(brick.y);
  const topRow = feetRow - h + 1;
  const half = Math.floor(w / 2);
  const left = Math.round(brick.cx) - half;

  const layers: LayerInput[] = [];

  // Top border (or single-row body that is just an underline).
  layers.push({ sprite: rowSprite(row(w, 'top')), x: left, y: topRow, color: brick.color });
  for (let r = 1; r < h - 1; r += 1) {
    layers.push({ sprite: rowSprite(row(w, 'side')), x: left, y: topRow + r, color: brick.color });
  }
  if (h >= 2) {
    layers.push({ sprite: rowSprite(row(w, 'bottom')), x: left, y: feetRow, color: brick.color });
  }

  // Face placement — overlay on the top edge for a squashed body,
  // otherwise on the top interior row.
  const faceY = h <= 2 ? topRow : topRow + 1;
  const faceX = left + Math.floor((w - brick.face.width) / 2);
  layers.push({ sprite: brick.face, x: faceX, y: faceY, color: brick.faceColor });

  return compose(layers, { width: stage.width, height: stage.height });
}
