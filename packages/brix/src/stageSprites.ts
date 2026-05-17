/**
 * Stage geometry + face glyphs. Body poses no longer live here — the
 * body is now parametric (see `brick.ts`) and driven by physics (see
 * `physics.ts`). What remains:
 *
 *   - the canvas dimensions and the floor row Brix's feet rest on,
 *   - the named face palette emote authors reach for.
 */

import type { StageGeom } from './brick';
import { type Cell, parseSprite, type Sprite } from './sprite';

export const STAGE_WIDTH = 15;
export const STAGE_HEIGHT = 7;
/** Row where Brix's feet land when grounded. */
export const STAGE_FLOOR_Y = 5;
/** Row that draws the faint horizontal floor line when the stage
 *  composes the floor layer. */
export const STAGE_FLOOR_LINE_Y = 6;

export const STAGE_GEOM: StageGeom = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  floorY: STAGE_FLOOR_Y,
};

/** Single-row floor sprite the stage layers underneath the body when
 *  `floor` is enabled. Sized to the default stage width. */
function makeFloorRow(width: number): Sprite {
  const cells: Cell[] = [];
  for (let i = 0; i < width; i += 1) {
    cells.push({ ch: '─', dim: true });
  }
  return { rows: [cells], width, height: 1 };
}

export const FLOOR_SPRITE: Sprite = makeFloorRow(STAGE_WIDTH);

/** Build a floor sprite for a custom-width stage. */
export function floorSprite(width: number = STAGE_WIDTH): Sprite {
  return width === STAGE_WIDTH ? FLOOR_SPRITE : makeFloorRow(width);
}

// ── Faces (1×3 mood glyphs) ─────────────────────────────────────────

export const FACE_NEUTRAL = parseSprite('◕◡◕');
export const FACE_HAPPY = parseSprite('^◡^');
export const FACE_EXCITED = parseSprite('◕▿◕');
export const FACE_THINKING = parseSprite('◔◡◔');
export const FACE_SLEEPY = parseSprite('─◡─');
export const FACE_PANIC = parseSprite('⊙▂⊙');
export const FACE_LOVE = parseSprite('♡◡♡');
export const FACE_OOPS = parseSprite('>◡<');
export const FACE_CURIOUS = parseSprite('⊙◡⊙');
export const FACE_SUSPICIOUS = parseSprite('¬◡¬');
export const FACE_STARRY = parseSprite('✦◡✦');
export const FACE_WINK = parseSprite('^◡-');
export const FACE_BLINK = parseSprite('─◡─');
export const FACE_FOCUS = parseSprite('•~•');
export const FACE_DEAD = parseSprite('x_x');
export const FACE_COOL = parseSprite('⌐◡⌐');
export const FACE_SHY = parseSprite('•‿•');
export const FACE_CHEEKY = parseSprite('◕ᴗ◕');
export const FACE_TIRED = parseSprite('╴ω╴');
// Underscore-mouth family — drop-in faces that share the `X_X` motif.
export const FACE_VACANT = parseSprite('._.');
export const FACE_ANNOYED = parseSprite('-_-');
export const FACE_GLEE = parseSprite('^_^');
export const FACE_SQUINT = parseSprite('>_<');
export const FACE_SOB = parseSprite('T_T');
export const FACE_WIDE = parseSprite('O_O');
export const FACE_PEEK = parseSprite('o_o');
export const FACE_DISAPPROVE = parseSprite('ಠ_ಠ');
export const FACE_DELIGHT = parseSprite('ʘ‿ʘ');

export const FACE_BY_NAME = {
  neutral: FACE_NEUTRAL,
  happy: FACE_HAPPY,
  excited: FACE_EXCITED,
  thinking: FACE_THINKING,
  sleepy: FACE_SLEEPY,
  panic: FACE_PANIC,
  love: FACE_LOVE,
  oops: FACE_OOPS,
  curious: FACE_CURIOUS,
  suspicious: FACE_SUSPICIOUS,
  starry: FACE_STARRY,
  wink: FACE_WINK,
  blink: FACE_BLINK,
  focus: FACE_FOCUS,
  dead: FACE_DEAD,
  cool: FACE_COOL,
  shy: FACE_SHY,
  cheeky: FACE_CHEEKY,
  tired: FACE_TIRED,
  vacant: FACE_VACANT,
  annoyed: FACE_ANNOYED,
  glee: FACE_GLEE,
  squint: FACE_SQUINT,
  sob: FACE_SOB,
  wide: FACE_WIDE,
  peek: FACE_PEEK,
  disapprove: FACE_DISAPPROVE,
  delight: FACE_DELIGHT,
} as const satisfies Readonly<Record<string, Sprite>>;

export type FaceName = keyof typeof FACE_BY_NAME;
