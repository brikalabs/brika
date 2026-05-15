import { describe, expect, test } from 'bun:test';
import { renderBrick } from '../brick';
import { makeBrick, step } from '../physics';
import { STAGE_GEOM, STAGE_HEIGHT, STAGE_WIDTH } from '../stageSprites';
import { tracksAt } from '../timeline';
import { defineEmote } from './builder';
import { EMOTE_LIBRARY } from './index';

describe('EMOTE_LIBRARY', () => {
  test('every entry exposes a non-empty timeline', () => {
    for (const [name, def] of Object.entries(EMOTE_LIBRARY)) {
      expect(def.name).toBe(name);
      expect(def.timeline.tracks.length).toBeGreaterThan(0);
      const frames = def.timeline.tracks[0]?.clip.frames;
      expect(frames).toBeDefined();
      expect((frames ?? []).length).toBeGreaterThan(0);
    }
  });

  test('every frame matches the stage canvas dimensions', () => {
    for (const def of Object.values(EMOTE_LIBRARY)) {
      for (const track of def.timeline.tracks) {
        for (const f of track.clip.frames) {
          expect(f.width).toBe(STAGE_WIDTH);
          expect(f.height).toBe(STAGE_HEIGHT);
        }
      }
    }
  });

  test('idle loops its timeline', () => {
    expect(EMOTE_LIBRARY.idle?.timeline.loop).toBe(true);
  });

  test('idle renders something at t=0', () => {
    const idle = EMOTE_LIBRARY.idle;
    if (!idle) {
      throw new Error('idle missing');
    }
    expect(tracksAt(idle.timeline, 0).length).toBeGreaterThan(0);
  });

  test('every spoken line is non-empty', () => {
    for (const def of Object.values(EMOTE_LIBRARY)) {
      if (def.line !== undefined) {
        expect(def.line.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('defineEmote (script DSL)', () => {
  test('wait beats produce one frame per simulation tick', () => {
    const e = defineEmote('test', {
      fps: 10,
      initial: { face: 'happy' },
      beats: [{ kind: 'wait', ms: 300 }],
    });
    const frames = e.timeline.tracks[0]?.clip.frames ?? [];
    // 300ms @ 10fps ≈ 3 frames (rounded).
    expect(frames.length).toBe(3);
  });

  test('impulse + waitLand produces a ballistic arc that ends on the floor', () => {
    const e = defineEmote('test-arc', {
      fps: 30,
      initial: { face: 'happy', cx: 5 },
      beats: [
        { kind: 'impulse', vx: 4, vy: 10 },
        { kind: 'waitLand', maxMs: 2000 },
      ],
    });
    const frames = e.timeline.tracks[0]?.clip.frames ?? [];
    expect(frames.length).toBeGreaterThan(5);
    // Final frame's bottom row contains the brick's `╰…╯`, so the
    // last opaque cell on row floorY must include the right corner.
    const last = frames[frames.length - 1];
    const floorRow = last?.rows[STAGE_GEOM.floorY];
    const hasCorner = floorRow?.some((c) => c?.ch === '╰' || c?.ch === '╯');
    expect(hasCorner).toBe(true);
  });

  test('tween smoothly increases body height while feet stay anchored', () => {
    const e = defineEmote('test-grow', {
      fps: 10,
      initial: { face: 'happy', h: 3 },
      beats: [{ kind: 'tween', h: 5, ms: 200 }],
    });
    const frames = e.timeline.tracks[0]?.clip.frames ?? [];
    // Every frame must keep a body bottom on the floor row.
    for (const f of frames) {
      const floorRow = f.rows[STAGE_GEOM.floorY];
      const hasCorner = floorRow?.some((c) => c?.ch === '╰' || c?.ch === '╯');
      expect(hasCorner).toBe(true);
    }
  });
});

describe('physics + brick', () => {
  test('renderBrick anchors bottom at floorY when y=0', () => {
    const sprite = renderBrick(
      {
        ...makeBrick({ h: 3 }),
        face: { rows: [[{ ch: '◕' }, { ch: '◡' }, { ch: '◕' }]], width: 3, height: 1 },
      },
      STAGE_GEOM
    );
    const floorRow = sprite.rows[STAGE_GEOM.floorY];
    expect(floorRow?.some((c) => c?.ch === '╰')).toBe(true);
  });

  test('growing the body taller pushes the top up, not the feet down', () => {
    const tall = renderBrick(
      {
        ...makeBrick({ h: 5 }),
        face: { rows: [[{ ch: '◕' }, { ch: '◡' }, { ch: '◕' }]], width: 3, height: 1 },
      },
      STAGE_GEOM
    );
    const floorRow = tall.rows[STAGE_GEOM.floorY];
    expect(floorRow?.some((c) => c?.ch === '╰')).toBe(true);
    const topRow = tall.rows[STAGE_GEOM.floorY - 4];
    expect(topRow?.some((c) => c?.ch === '╭')).toBe(true);
  });

  test('step integrates gravity and stops at floor', () => {
    let s = makeBrick({ y: 0, vy: 10 });
    for (let i = 0; i < 60; i += 1) {
      s = step(s, 33);
    }
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(0);
    expect(s.vy).toBe(0);
  });

  test('body sprite is floor-free — the floor is a stage layer, not part of the body', () => {
    // The row below feet (formerly the floor line) must be entirely
    // null in the body sprite so callers can opt out of the floor.
    const sprite = renderBrick(
      {
        ...makeBrick({ h: 3 }),
        face: { rows: [[{ ch: '◕' }, { ch: '◡' }, { ch: '◕' }]], width: 3, height: 1 },
      },
      STAGE_GEOM
    );
    const belowFloor = sprite.rows[STAGE_GEOM.floorY + 1];
    expect(belowFloor?.every((c) => c === null)).toBe(true);
  });
});
