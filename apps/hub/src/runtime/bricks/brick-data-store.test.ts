import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { get, useTestBed } from '@brika/di/testing';
import { BrickDataStore } from '@/runtime/bricks/brick-data-store';

useTestBed({ autoStub: false });

describe('BrickDataStore', () => {
  let store: BrickDataStore;

  beforeEach(() => {
    store = get(BrickDataStore);
  });

  test('get() returns undefined for unknown key', () => {
    expect(store.get('unknown:brick')).toBeUndefined();
  });

  test('set() stores data and get() retrieves it', () => {
    store.set('timer:clock', { time: '12:00' });

    expect(store.get('timer:clock')).toEqual({ time: '12:00' });
  });

  test('set() overwrites previous data', () => {
    store.set('timer:clock', { time: '12:00' });
    store.set('timer:clock', { time: '13:00' });

    expect(store.get('timer:clock')).toEqual({ time: '13:00' });
  });

  test('removeByPlugin() removes all entries for a plugin', () => {
    store.set('timer:clock', { time: '12:00' });
    store.set('timer:stopwatch', { elapsed: 0 });
    store.set('weather:forecast', { temp: 20 });

    store.removeByPlugin('timer');

    expect(store.get('timer:clock')).toBeUndefined();
    expect(store.get('timer:stopwatch')).toBeUndefined();
    expect(store.get('weather:forecast')).toEqual({ temp: 20 });
  });

  test('removeByPlugin() does nothing for unknown plugin', () => {
    store.set('timer:clock', { time: '12:00' });

    store.removeByPlugin('unknown');

    expect(store.get('timer:clock')).toEqual({ time: '12:00' });
  });
});
