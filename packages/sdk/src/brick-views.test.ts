import { describe, expect, test } from 'bun:test';
import {
  defineBrickData,
  useBrickConfig,
  useBrickData,
  useBrickSize,
  useCallBrickAction,
} from './brick-views';

describe('brick-views (outside client context)', () => {
  test('useBrickData() throws', () => {
    expect(() => useBrickData()).toThrow(
      'useBrickData() is only available in client-rendered bricks'
    );
  });

  test('useBrickConfig() throws', () => {
    expect(() => useBrickConfig()).toThrow(
      'useBrickConfig() is only available in client-rendered bricks'
    );
  });

  test('useBrickSize() throws', () => {
    expect(() => useBrickSize()).toThrow(
      'useBrickSize() is only available in client-rendered bricks'
    );
  });

  test('useCallBrickAction() throws', () => {
    expect(() => useCallBrickAction()).toThrow(
      'useCallBrickAction() is only available in client-rendered bricks'
    );
  });
});

describe('defineBrickData', () => {
  test('binds the id; set/use only work in their own environment', () => {
    const channel = defineBrickData<{ n: number }>('player');
    expect(channel.id).toBe('player');
    // Outside a plugin process, set() reaches getContext() and use() is the
    // client-only hook stub; both throw here.
    expect(() => channel.set({ n: 1 })).toThrow();
    expect(() => channel.use()).toThrow(
      'useBrickData() is only available in client-rendered bricks'
    );
  });
});
