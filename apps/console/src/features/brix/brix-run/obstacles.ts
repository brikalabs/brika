/**
 * Obstacle catalog + lifecycle (sprites, hit/visual boxes, spawn,
 * tick, retire). Hitboxes are narrower than rendered sprites — arms
 * and wing-tips are forgiving visual flourish.
 */

import { parseSprite, type Sprite } from '@brika/brix';
import {
  BENT_UNLOCK_MS,
  FLYING_UNLOCK_MS,
  SPAWN_GAP_MAX_CELLS,
  SPAWN_GAP_MIN_CELLS,
  TWIN_UNLOCK_MS,
} from './constants';
import { rand } from './random';

export type ObstacleKind = 'sprout' | 'pup' | 'saguaro' | 'bent' | 'twin' | 'bird';

export interface Obstacle {
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly x: number;
}

export interface ObstacleDef {
  readonly hitW: number;
  readonly hitH: number;
  readonly alt: number;
  readonly spriteW: number;
  readonly spriteH: number;
  readonly color: string;
}

// Cactus shapes — all ≤ 3 cells tall so a normal jump clears them.
const SPROUT = parseSprite('▓\n▓');
const PUP = parseSprite('·▓·\n▓▓▓');
const SAGUARO = parseSprite('▓·▓\n▓▓▓\n·▓·');
const BENT = parseSprite('·▓▓\n·▓·\n·▓·');
const TWIN = parseSprite('▓·▓\n▓·▓\n▓▓▓');

// Bird wing-flap cycle.
const BIRD_UP = parseSprite('╲o╱');
const BIRD_LEVEL = parseSprite('─o─');
const BIRD_DOWN = parseSprite('╱o╲');
const BIRD_FLAP_STEP_MS = 180;

export const OBSTACLES: Readonly<Record<ObstacleKind, ObstacleDef>> = {
  sprout: { hitW: 1, hitH: 2, alt: 0, spriteW: 1, spriteH: 2, color: 'green' },
  pup: { hitW: 1, hitH: 2, alt: 0, spriteW: 3, spriteH: 2, color: 'greenBright' },
  saguaro: { hitW: 1, hitH: 3, alt: 0, spriteW: 3, spriteH: 3, color: 'greenBright' },
  bent: { hitW: 1, hitH: 3, alt: 0, spriteW: 3, spriteH: 3, color: 'green' },
  twin: { hitW: 3, hitH: 3, alt: 0, spriteW: 3, spriteH: 3, color: 'greenBright' },
  bird: { hitW: 1, hitH: 1, alt: 2, spriteW: 3, spriteH: 1, color: 'redBright' },
};

const STATIC_SPRITES: Readonly<Record<Exclude<ObstacleKind, 'bird'>, Sprite>> = {
  sprout: SPROUT,
  pup: PUP,
  saguaro: SAGUARO,
  bent: BENT,
  twin: TWIN,
};

const BIRD_CYCLE: ReadonlyArray<Sprite> = [BIRD_UP, BIRD_LEVEL, BIRD_DOWN, BIRD_LEVEL];

/** Time-aware sprite picker. Pure: same `t` → same sprite. */
export function spriteFor(kind: ObstacleKind, t: number): Sprite {
  if (kind === 'bird') {
    return BIRD_CYCLE[Math.floor(t / BIRD_FLAP_STEP_MS) % BIRD_CYCLE.length] ?? BIRD_LEVEL;
  }
  return STATIC_SPRITES[kind];
}

/** Scroll obstacles by `scrollSpeed * dt` cells; return survivors and
 *  the number that just exited the left edge (worth a score point each). */
export function tickObstacles(
  obstacles: ReadonlyArray<Obstacle>,
  scrollSpeed: number,
  dtSec: number
): { obstacles: Obstacle[]; passed: number } {
  const dx = scrollSpeed * dtSec;
  const out: Obstacle[] = [];
  let passed = 0;
  for (const ob of obstacles) {
    const x = ob.x - dx;
    if (x + OBSTACLES[ob.kind].spriteW < 0) {
      passed += 1;
    } else {
      out.push({ ...ob, x });
    }
  }
  return { obstacles: out, passed };
}

function pickCactus(t: number): ObstacleKind {
  const bentUnlocked = t >= BENT_UNLOCK_MS;
  const twinUnlocked = t >= TWIN_UNLOCK_MS;
  const r = rand(0, 1);
  if (twinUnlocked && r > 0.85) {
    return 'twin';
  }
  if (bentUnlocked && r > 0.65) {
    return 'bent';
  }
  if (r > 0.45) {
    return 'saguaro';
  }
  if (r > 0.2) {
    return 'pup';
  }
  return 'sprout';
}

function spawnObstacle(id: number, t: number, worldWidth: number): Obstacle {
  const kind = t >= FLYING_UNLOCK_MS && rand(0, 1) > 0.78 ? 'bird' : pickCactus(t);
  return { id, kind, x: worldWidth + 1 };
}

export function maybeSpawn(
  obstacles: ReadonlyArray<Obstacle>,
  t: number,
  nextSpawnAt: number,
  nextId: number,
  scrollSpeed: number,
  worldWidth: number
): { obstacles: ReadonlyArray<Obstacle>; nextSpawnAt: number; nextId: number } {
  if (t < nextSpawnAt) {
    return { obstacles, nextSpawnAt, nextId };
  }
  const gapCells = SPAWN_GAP_MIN_CELLS + rand(0, SPAWN_GAP_MAX_CELLS - SPAWN_GAP_MIN_CELLS);
  return {
    obstacles: [...obstacles, spawnObstacle(nextId, t, worldWidth)],
    nextSpawnAt: t + (gapCells / scrollSpeed) * 1000,
    nextId: nextId + 1,
  };
}
