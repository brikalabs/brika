import { describe, expect, test } from 'bun:test';
import { useCallBrickAction, useBrickConfig, useBrickData, useBrickSize } from '../brick-views';

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
