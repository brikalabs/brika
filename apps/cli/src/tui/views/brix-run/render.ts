/**
 * Pure world composition: `GameState` → composited Sprite.
 * Layer order back→front: sun, clouds, Brix, obstacles, floor, overlay.
 */

import {
  type Cell,
  compose,
  FACE_BY_NAME,
  type LayerInput,
  renderBrick,
  type Sprite,
  type StageGeom,
} from '@brika/brix';
import { FLOOR_PATTERN } from './constants';
import type { Geometry } from './geometry';
import { OBSTACLES, spriteFor } from './obstacles';
import { gameOverPanel, pausedPanel, readyPanel } from './panels';
import type { GameState } from './state';

const SUN: Sprite = { rows: [[{ ch: '✦', color: 'yellow', bold: true }]], width: 1, height: 1 };

function cloudSprite(glyph: string): Sprite {
  const cells: Cell[] = [...glyph].map((ch) => ({ ch, dim: true }));
  return { rows: [cells], width: cells.length, height: 1 };
}

function floorCell(ch: string): Cell {
  if (ch === ',') {
    return { ch, color: 'green' };
  }
  if (ch === '*') {
    return { ch, color: 'magenta' };
  }
  if (ch === '·') {
    return { ch, color: 'gray', dim: true };
  }
  return { ch, dim: true };
}

function floorRow(width: number, offset: number): Sprite {
  const off = Math.floor(offset);
  const cells: Cell[] = [];
  for (let i = 0; i < width; i += 1) {
    const idx = (((i + off) % FLOOR_PATTERN.length) + FLOOR_PATTERN.length) % FLOOR_PATTERN.length;
    cells.push(floorCell(FLOOR_PATTERN[idx] ?? '═'));
  }
  return { rows: [cells], width, height: 1 };
}

/** Brix's face — derived from state, never stored. */
function pickFace(state: GameState): Sprite {
  if (state.status === 'over') {
    return FACE_BY_NAME.dead;
  }
  if (!state.brix.grounded) {
    return FACE_BY_NAME.excited;
  }
  if (state.crouchUntil > state.t) {
    return FACE_BY_NAME.shy;
  }
  if (state.moveLeftUntil > state.t || state.moveRightUntil > state.t) {
    return FACE_BY_NAME.cheeky;
  }
  return Math.floor(state.t / 200) % 6 === 0 ? FACE_BY_NAME.wink : FACE_BY_NAME.happy;
}

function brixColor(state: GameState): string {
  if (state.status === 'over') {
    return 'red';
  }
  return state.brix.grounded ? 'cyanBright' : 'yellow';
}

function statusOverlay(state: GameState): Sprite | null {
  switch (state.status) {
    case 'ready':
      return readyPanel(Math.floor(Date.now() / 500) % 2 === 0);
    case 'paused':
      return pausedPanel();
    case 'over':
      return gameOverPanel(state.score, state.best);
    case 'running':
      return null;
  }
}

function centered(sprite: Sprite, geom: Geometry): LayerInput {
  return {
    sprite,
    x: Math.max(0, Math.floor((geom.worldWidth - sprite.width) / 2)),
    y: Math.max(0, Math.floor((geom.worldHeight - sprite.height) / 2) - 1),
  };
}

export function renderWorld(state: GameState, geom: Geometry): Sprite {
  const stage: StageGeom = {
    width: geom.worldWidth,
    height: geom.worldHeight,
    floorY: geom.floorY,
  };

  const layers: LayerInput[] = [{ sprite: SUN, x: geom.sunX, y: 0 }];

  for (const c of state.clouds) {
    const xi = Math.round(c.x);
    if (xi > -c.glyph.length && xi < geom.worldWidth) {
      layers.push({ sprite: cloudSprite(c.glyph), x: xi, y: c.y });
    }
  }

  layers.push(
    renderBrick({ ...state.brix, face: pickFace(state), color: brixColor(state) }, stage)
  );

  for (const ob of state.obstacles) {
    const def = OBSTACLES[ob.kind];
    layers.push({
      sprite: spriteFor(ob.kind, state.t),
      x: Math.round(ob.x),
      y: geom.floorY - def.alt - def.spriteH + 1,
      color: def.color,
    });
  }

  layers.push({ sprite: floorRow(geom.worldWidth, state.scrollOffset), x: 0, y: geom.floorLineY });

  const overlay = statusOverlay(state);
  if (overlay) {
    layers.push(centered(overlay, geom));
  }

  return compose(layers, { width: geom.worldWidth, height: geom.worldHeight });
}

export function borderColorFor(status: GameState['status']): string {
  if (status === 'over') {
    return 'red';
  }
  if (status === 'paused') {
    return 'yellow';
  }
  return 'cyan';
}
