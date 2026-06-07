import { afterEach, describe, expect, test } from 'bun:test';
import { collectBlock, collectSpark, drainCollector, installCollector } from './collect';

describe('build collector', () => {
  // Drain after every test so a leaked install never bleeds into the next.
  afterEach(() => {
    drainCollector();
  });

  test('records nothing when no collector is installed', () => {
    collectBlock({ id: 'x', meta: { category: 'trigger' } });
    collectSpark({ id: 'y' });
    expect(drainCollector()).toEqual({ blocks: [], sparks: [] });
  });

  test('captures blocks and sparks between install and drain', () => {
    installCollector();
    collectBlock({ id: 'timer', meta: { name: 'Timer', category: 'trigger' } });
    collectSpark({ id: 'tick', meta: { name: 'Tick' } });

    expect(drainCollector()).toEqual({
      blocks: [{ id: 'timer', meta: { name: 'Timer', category: 'trigger' } }],
      sparks: [{ id: 'tick', meta: { name: 'Tick' } }],
    });
  });

  test('drain stops capture until the next install', () => {
    installCollector();
    collectBlock({ id: 'a', meta: { category: 'flow' } });
    drainCollector();

    collectBlock({ id: 'b', meta: { category: 'flow' } });
    expect(drainCollector()).toEqual({ blocks: [], sparks: [] });
  });
});
