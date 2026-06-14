import { describe, expect, test } from 'bun:test';
import { PluginReaper, type ReapableProcess } from './plugin-reaper';

// A controllable clock + process table so the reaper's policy is tested
// deterministically, with no timers or real plugins.
function harness(
  initial: ReapableProcess[],
  opts?: { idleReapMs?: number; keepWarmCount?: number }
) {
  let nowMs = 1_000_000;
  let table = initial;
  const reaped: string[] = [];
  const reaper = new PluginReaper({
    idleReapMs: opts?.idleReapMs ?? 1000,
    keepWarmCount: opts?.keepWarmCount ?? 0,
    sweepIntervalMs: 100,
    now: () => nowMs,
    listProcesses: () => table,
    reap: (name) => {
      reaped.push(name);
      table = table.filter((p) => p.name !== name);
    },
  });
  return {
    reaper,
    reaped,
    advance: (ms: number) => {
      nowMs += ms;
    },
    setTable: (next: ReapableProcess[]) => {
      table = next;
    },
  };
}

const proc = (name: string, lastActivityAt: number, hasInFlight = false): ReapableProcess => ({
  name,
  lastActivityAt,
  hasInFlight,
});

describe('PluginReaper', () => {
  test('is disabled when idleReapMs <= 0 and never reaps', () => {
    const h = harness([proc('a', 0)], { idleReapMs: 0 });
    expect(h.reaper.enabled).toBe(false);
    h.advance(1_000_000);
    h.reaper.sweep();
    expect(h.reaped).toEqual([]);
  });

  test('reaps a plugin once its idle window elapses', () => {
    const h = harness([proc('a', 1_000_000)], { idleReapMs: 1000 });
    // Not yet idle.
    h.advance(999);
    expect(h.reaper.reapable()).toEqual([]);
    // Window elapsed.
    h.advance(1);
    expect(h.reaper.reapable()).toEqual(['a']);
    h.reaper.sweep();
    expect(h.reaped).toEqual(['a']);
  });

  test('never reaps a plugin with an in-flight call, however idle', () => {
    const h = harness([proc('a', 0, true)], { idleReapMs: 1000 });
    h.advance(1_000_000);
    expect(h.reaper.reapable()).toEqual([]);
  });

  test('a guard pins a plugin (e.g. an executor owns its block)', () => {
    const h = harness([proc('a', 0), proc('b', 0)], { idleReapMs: 1000 });
    h.reaper.addGuard((name) => name === 'a');
    h.advance(5000);
    expect(h.reaper.reapable().sort()).toEqual(['b']);
  });

  test('removing a guard makes the plugin reapable again', () => {
    const h = harness([proc('a', 0)], { idleReapMs: 1000 });
    const remove = h.reaper.addGuard(() => true);
    h.advance(5000);
    expect(h.reaper.reapable()).toEqual([]);
    remove();
    expect(h.reaper.reapable()).toEqual(['a']);
  });

  test('keep-warm protects the N most-recently-active plugins', () => {
    const h = harness([proc('old', 1000), proc('mid', 2000), proc('hot', 3000)], {
      idleReapMs: 1, // everything is idle relative to now
      keepWarmCount: 1,
    });
    h.advance(10_000);
    // Only the single hottest plugin is warm; the other two are reapable.
    expect(h.reaper.reapable().sort()).toEqual(['mid', 'old']);
  });

  test('keepWarmCount >= running plugins protects all of them', () => {
    const h = harness([proc('a', 0), proc('b', 0)], { idleReapMs: 1, keepWarmCount: 5 });
    h.advance(10_000);
    expect(h.reaper.reapable()).toEqual([]);
  });

  test('start() is a no-op when disabled (no timer leak)', () => {
    const h = harness([proc('a', 0)], { idleReapMs: 0 });
    h.reaper.start();
    h.reaper.stop();
    expect(h.reaped).toEqual([]);
  });
});
