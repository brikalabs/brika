/** Every game tunable. Edit here to rebalance. */

// Brix
export const BRIX_W = 5;
export const BRIX_H = 3;
export const HITBOX_W = 3;
export const CROUCH_H = 2;
export const CROUCH_HOLD_MS = 700;
export const MOVE_HOLD_MS = 240;
export const MOVE_VX = 9;

// Physics
export const GAME_GRAVITY = 26;
export const JUMP_VY = 14;

// World scroll
export const INITIAL_SCROLL = 8;
export const SCROLL_ACCEL = 0.32;
export const MAX_SCROLL = 24;
export const SPAWN_GAP_MIN_CELLS = 16;
export const SPAWN_GAP_MAX_CELLS = 32;
export const INITIAL_SPAWN_DELAY_MS = 1200;

// Obstacle unlocks
export const BENT_UNLOCK_MS = 6_000;
export const FLYING_UNLOCK_MS = 10_000;
export const TWIN_UNLOCK_MS = 12_000;

// Tick & decor
export const TICK_FPS = 30;
export const TICK_MS = Math.floor(1000 / TICK_FPS);
export const CLOUD_SPEED_RATIO = 0.22;
export const CLOUD_GLYPHS: ReadonlyArray<string> = ['~⌒~', '◌◌◌', '∘ ∘', '·∘·', '⌒⌒'];
export const FLOOR_PATTERN = '═════·═════,═════*═════';

// Canvas
export const MIN_WORLD_WIDTH = 40;
export const MAX_WORLD_WIDTH = 80;
export const MIN_WORLD_HEIGHT = 9;
export const MAX_WORLD_HEIGHT = 16;
export const FALLBACK_WORLD_WIDTH = 60;
export const FALLBACK_WORLD_HEIGHT = 11;
