import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  _beginRender,
  _cleanupEffects,
  _createState,
  _endRender,
  type BrickState,
} from '../brick-hooks';
import { useBrickSize } from '../brick-hooks/use-brick-size';
import { useCallback, useMemo } from '../brick-hooks/use-memo';
import { usePreference } from '../brick-hooks/use-preference';
import { useRef } from '../brick-hooks/use-ref';
import { useState } from '../brick-hooks/use-state';

// resolveAction is not in @brika/ui-kit's public exports, but we need it
// to exercise the registrar that _beginRender installs.
// Use the resolved filesystem path to bypass package exports restrictions.
const uiKitNodesPath = require
  .resolve('@brika/ui-kit')
  .replace('/src/index.ts', '/src/nodes/_shared.ts');
const uiKitNodes = require(uiKitNodesPath) as {
  resolveAction: (handler: () => void) => string;
};

/** Wait for queued microtasks (scheduleRender uses queueMicrotask). */
const flush = () => new Promise<void>((r) => setTimeout(r, 10));

/** Simulate a render cycle: beginRender → call hooks → endRender. */
function render(state: BrickState, fn: () => void) {
  _beginRender(state);
  fn();
  _endRender();
}

// ─────────────────────────────────────────────────────────────────────────────
// useState
// ─────────────────────────────────────────────────────────────────────────────

describe('useState', () => {
  test('returns initial value on first render', () => {
    const state = _createState(() => {});
    let val: number | undefined;

    render(state, () => {
      [val] = useState(0);
    });

    expect(val).toBe(0);
  });

  test('returns initial value from factory function', () => {
    const state = _createState(() => {});
    let val: string | undefined;

    render(state, () => {
      [val] = useState(() => 'computed');
    });

    expect(val).toBe('computed');
  });

  test('factory is only called on first render', () => {
    const state = _createState(() => {});
    let callCount = 0;
    const factory = () => {
      callCount++;
      return 42;
    };

    render(state, () => {
      useState(factory);
    });
    render(state, () => {
      useState(factory);
    });
    render(state, () => {
      useState(factory);
    });

    expect(callCount).toBe(1);
  });

  test('preserves state across re-renders', () => {
    const state = _createState(() => {});
    let val: number | undefined;

    render(state, () => {
      [val] = useState(0);
    });
    expect(val).toBe(0);

    render(state, () => {
      [val] = useState(0);
    });
    expect(val).toBe(0);
  });

  test('setter with direct value updates state and triggers re-render', async () => {
    let renders = 0;
    const state = _createState(() => {
      renders++;
    });
    let val: number | undefined;
    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [val, set] = useState(0);
    });
    expect(val).toBe(0);

    set(5);
    await flush();
    expect(renders).toBeGreaterThanOrEqual(1);

    render(state, () => {
      [val, set] = useState(0);
    });
    expect(val).toBe(5);
  });

  test('setter with updater function receives previous value', async () => {
    let _renders = 0;
    const state = _createState(() => {
      _renders++;
    });
    let val: number | undefined;
    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [val, set] = useState(10);
    });
    expect(val).toBe(10);

    set((prev) => prev + 5);
    await flush();

    render(state, () => {
      [val, set] = useState(10);
    });
    expect(val).toBe(15);
  });

  test('setter does not trigger re-render when value is the same (Object.is)', async () => {
    let renders = 0;
    const state = _createState(() => {
      renders++;
    });
    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [, set] = useState(0);
    });

    set(0); // same value
    await flush();

    expect(renders).toBe(0);
  });

  test('multiple useState hooks maintain independent state', () => {
    const state = _createState(() => {});
    let a: number | undefined;
    let b: string | undefined;

    render(state, () => {
      [a] = useState(1);
      [b] = useState('hello');
    });

    expect(a).toBe(1);
    expect(b).toBe('hello');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useRef
// ─────────────────────────────────────────────────────────────────────────────

describe('useRef', () => {
  test('returns object with current set to initial value', () => {
    const state = _createState(() => {});
    let ref:
      | {
          current: number;
        }
      | undefined;

    render(state, () => {
      ref = useRef(42);
    });

    expect(ref).toEqual({
      current: 42,
    });
  });

  test('preserves the same ref object across re-renders', () => {
    const state = _createState(() => {});
    let ref1:
      | {
          current: number;
        }
      | undefined;
    let ref2:
      | {
          current: number;
        }
      | undefined;

    render(state, () => {
      ref1 = useRef(0);
    });
    render(state, () => {
      ref2 = useRef(0);
    });

    expect(ref1).toBe(ref2); // same reference
  });

  test('mutations to .current persist across renders', () => {
    const state = _createState(() => {});
    let ref!: {
      current: number;
    };

    render(state, () => {
      ref = useRef(0);
    });
    ref.current = 99;

    render(state, () => {
      ref = useRef(0);
    });
    expect(ref.current).toBe(99);
  });

  test('works with null initial value', () => {
    const state = _createState(() => {});
    let ref:
      | {
          current: null;
        }
      | undefined;

    render(state, () => {
      ref = useRef(null);
    });

    expect(ref).toEqual({
      current: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMemo
// ─────────────────────────────────────────────────────────────────────────────

describe('useMemo', () => {
  test('computes value on first render', () => {
    const state = _createState(() => {});
    let val: number | undefined;

    render(state, () => {
      val = useMemo(() => 2 + 3, []);
    });

    expect(val).toBe(5);
  });

  test('returns cached value when deps do not change', () => {
    const state = _createState(() => {});
    let callCount = 0;
    let val: number | undefined;

    const dep = 'stable';

    render(state, () => {
      val = useMemo(() => {
        callCount++;
        return 10;
      }, [dep]);
    });
    render(state, () => {
      val = useMemo(() => {
        callCount++;
        return 10;
      }, [dep]);
    });

    expect(callCount).toBe(1);
    expect(val).toBe(10);
  });

  test('recomputes when deps change', () => {
    const state = _createState(() => {});
    let val: number | undefined;
    let dep = 1;

    render(state, () => {
      val = useMemo(() => dep * 10, [dep]);
    });
    expect(val).toBe(10);

    dep = 2;
    render(state, () => {
      val = useMemo(() => dep * 10, [dep]);
    });
    expect(val).toBe(20);
  });

  test('recomputes when deps array length changes', () => {
    const state = _createState(() => {});
    let callCount = 0;

    render(state, () => {
      useMemo(() => {
        callCount++;
        return 0;
      }, [1]);
    });
    render(state, () => {
      useMemo(() => {
        callCount++;
        return 0;
      }, [1, 2]);
    });

    expect(callCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCallback
// ─────────────────────────────────────────────────────────────────────────────

describe('useCallback', () => {
  test('returns the same function reference when deps do not change', () => {
    const state = _createState(() => {});
    let fn1: (() => void) | undefined;
    let fn2: (() => void) | undefined;

    render(state, () => {
      fn1 = useCallback(() => {}, []);
    });
    render(state, () => {
      fn2 = useCallback(() => {}, []);
    });

    expect(fn1).toBe(fn2);
  });

  test('returns a new function reference when deps change', () => {
    const state = _createState(() => {});
    let fn1: (() => void) | undefined;
    let fn2: (() => void) | undefined;

    render(state, () => {
      fn1 = useCallback(() => {}, [1]);
    });
    render(state, () => {
      fn2 = useCallback(() => {}, [2]);
    });

    expect(fn1).not.toBe(fn2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useBrickSize
// ─────────────────────────────────────────────────────────────────────────────

describe('useBrickSize', () => {
  test('returns default brick size from state', () => {
    const state = _createState(() => {});
    let size:
      | {
          width: number;
          height: number;
        }
      | undefined;

    render(state, () => {
      size = useBrickSize();
    });

    expect(size).toEqual({
      width: 2,
      height: 2,
    });
  });

  test('returns updated brick size when state is mutated', () => {
    const state = _createState(() => {});
    state.brickSize = {
      width: 4,
      height: 3,
    };

    let size:
      | {
          width: number;
          height: number;
        }
      | undefined;

    render(state, () => {
      size = useBrickSize();
    });

    expect(size).toEqual({
      width: 4,
      height: 3,
    });
  });

  test('reflects size changes across re-renders', () => {
    const state = _createState(() => {});
    let size:
      | {
          width: number;
          height: number;
        }
      | undefined;

    render(state, () => {
      size = useBrickSize();
    });
    expect(size).toEqual({
      width: 2,
      height: 2,
    });

    state.brickSize = {
      width: 6,
      height: 4,
    };

    render(state, () => {
      size = useBrickSize();
    });
    expect(size).toEqual({
      width: 6,
      height: 4,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usePreference
// ─────────────────────────────────────────────────────────────────────────────

describe('usePreference', () => {
  test('no-args overload returns full config object', () => {
    const state = _createState(() => {});
    state.config = {
      theme: 'dark',
      lang: 'en',
    };

    let config: Record<string, unknown> | undefined;

    render(state, () => {
      config = usePreference();
    });

    expect(config).toEqual({
      theme: 'dark',
      lang: 'en',
    });
  });

  test('named preference returns current value from config', () => {
    const state = _createState(() => {});
    state.config = {
      color: 'blue',
    };
    state.configKeys = new Set(['color']);

    let val: string | undefined;

    render(state, () => {
      [val] = usePreference('color', 'red');
    });

    expect(val).toBe('blue');
  });

  test('named preference returns defaultValue when key is missing from config', () => {
    const state = _createState(() => {});
    state.config = {};
    state.configKeys = new Set(['missing']);

    let val: number | undefined;

    render(state, () => {
      [val] = usePreference('missing', 42);
    });

    expect(val).toBe(42);
  });

  test('setter updates config value and triggers re-render', async () => {
    let renders = 0;
    const state = _createState(() => {
      renders++;
    });
    state.config = {
      count: 0,
    };
    state.configKeys = new Set(['count']);

    let val: number | undefined;
    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [val, set] = usePreference('count', 0);
    });
    expect(val).toBe(0);

    set(5);
    await flush();
    expect(renders).toBeGreaterThanOrEqual(1);
    expect(state.config.count).toBe(5);
  });

  test('setter with updater function receives previous value', async () => {
    const state = _createState(() => {});
    state.config = {
      count: 10,
    };
    state.configKeys = new Set(['count']);

    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [, set] = usePreference('count', 0);
    });

    set((prev) => prev + 5);
    await flush();

    expect(state.config.count).toBe(15);
  });

  test('setter does not trigger re-render when value is the same', async () => {
    let renders = 0;
    const state = _createState(() => {
      renders++;
    });
    state.config = {
      x: 'hello',
    };
    state.configKeys = new Set(['x']);

    let set!: (v: string | ((p: string) => string)) => void;

    render(state, () => {
      [, set] = usePreference('x', '');
    });

    set('hello'); // same value
    await flush();

    expect(renders).toBe(0);
  });

  test('setter uses defaultValue as prev when config key is missing', async () => {
    const state = _createState(() => {});
    state.config = {};
    state.configKeys = new Set(['val']);

    let set!: (v: number | ((p: number) => number)) => void;

    render(state, () => {
      [, set] = usePreference('val', 100);
    });

    set((prev) => prev + 1);
    await flush();

    expect(state.config.val).toBe(101);
  });

  test('warns when key is not in configKeys (once per key)', () => {
    const state = _createState(() => {});
    state.config = {};
    state.configKeys = new Set(['declared']);

    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      // First call with undeclared key — should warn
      render(state, () => {
        usePreference('undeclared_test_key_xyz', 'default');
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect((warnSpy.mock.calls as unknown[][])[0]?.[0]).toContain('undeclared_test_key_xyz');

      // Second call with same key — should NOT warn again (warn-once)
      render(state, () => {
        usePreference('undeclared_test_key_xyz', 'default');
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('does not warn when configKeys is null', () => {
    const state = _createState(() => {});
    state.config = {};
    state.configKeys = null;

    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      render(state, () => {
        usePreference('anything', 'default');
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _beginRender action registrar
// ─────────────────────────────────────────────────────────────────────────────

describe('_beginRender action registrar', () => {
  test('clears auto-registered actions (keys starting with __a) on each render', () => {
    const state = _createState(() => {});
    // Simulate auto-registered actions from a previous render
    state.actionRefs.set('__a0', {
      current: () => {},
    });
    state.actionRefs.set('__a1', {
      current: () => {},
    });
    // A manually-registered action should not be cleared
    state.actionRefs.set('my-action', {
      current: () => {},
    });

    _beginRender(state);

    expect(state.actionRefs.has('__a0')).toBe(false);
    expect(state.actionRefs.has('__a1')).toBe(false);
    expect(state.actionRefs.has('my-action')).toBe(true);

    _endRender();
  });

  test('registrar auto-registers action handlers with incrementing IDs', () => {
    const state = _createState(() => {});
    const handler1 = () => {};
    const handler2 = () => {};

    _beginRender(state);

    // resolveAction calls the registrar installed by _beginRender
    const id1 = uiKitNodes.resolveAction(handler1);
    const id2 = uiKitNodes.resolveAction(handler2);

    expect(id1).toBe('__a0');
    expect(id2).toBe('__a1');
    expect(state.actionRefs.has('__a0')).toBe(true);
    expect(state.actionRefs.has('__a1')).toBe(true);
    expect(state.actionRefs.get('__a0')?.current).toBe(handler1);
    expect(state.actionRefs.get('__a1')?.current).toBe(handler2);

    _endRender();
  });

  test('registrar updates existing action ref handler when key already exists', () => {
    const state = _createState(() => {});
    const handler1 = () => 'first';
    const handler2 = () => 'second';

    _beginRender(state);

    // Manually add the existing ref AFTER _beginRender clears __a keys
    // but BEFORE calling resolveAction, to test the "existing" branch
    state.actionRefs.set('__a0', {
      current: handler1,
    });

    // resolveAction with the registrar will see __a0 already exists
    const id = uiKitNodes.resolveAction(handler2);
    expect(id).toBe('__a0');
    // The existing ref's current should be updated (not replaced)
    expect(state.actionRefs.get('__a0')?.current).toBe(handler2);

    _endRender();
  });

  test('action refs are tracked across render cycles', () => {
    const state = _createState(() => {});

    // First render cycle
    _beginRender(state);
    uiKitNodes.resolveAction(() => {});
    uiKitNodes.resolveAction(() => {});
    _endRender();

    expect(state.actionRefs.size).toBe(2);

    // Second render cycle - __a-prefixed keys should be cleared
    _beginRender(state);
    expect(state.actionRefs.size).toBe(0);
    _endRender();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hooks outside render context
// ─────────────────────────────────────────────────────────────────────────────

describe('hooks outside render context', () => {
  test('useState throws when called outside render', () => {
    expect(() => useState(0)).toThrow('Hooks can only be called inside a brick component');
  });

  test('useRef throws when called outside render', () => {
    expect(() => useRef(null)).toThrow('Hooks can only be called inside a brick component');
  });

  test('useMemo throws when called outside render', () => {
    expect(() => useMemo(() => 0, [])).toThrow('Hooks can only be called inside a brick component');
  });

  test('useBrickSize throws when called outside render', () => {
    expect(() => useBrickSize()).toThrow('Hooks can only be called inside a brick component');
  });

  test('usePreference throws when called outside render', () => {
    expect(() => usePreference()).toThrow('Hooks can only be called inside a brick component');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _createState / _cleanupEffects
// ─────────────────────────────────────────────────────────────────────────────

describe('_createState', () => {
  test('returns state with default brickSize', () => {
    const state = _createState(() => {});
    expect(state.brickSize).toEqual({
      width: 2,
      height: 2,
    });
  });

  test('scheduleRender debounces via microtask', async () => {
    let renderCount = 0;
    const state = _createState(() => {
      renderCount++;
    });

    // Multiple calls to scheduleRender should batch into one
    state.scheduleRender();
    state.scheduleRender();
    state.scheduleRender();

    await flush();

    expect(renderCount).toBe(1);
  });

  test('scheduleRender fires again after microtask drains', async () => {
    let renderCount = 0;
    const state = _createState(() => {
      renderCount++;
    });

    state.scheduleRender();
    await flush();
    expect(renderCount).toBe(1);

    state.scheduleRender();
    await flush();
    expect(renderCount).toBe(2);
  });
});

describe('_cleanupEffects', () => {
  test('calls cleanup on effects and clears the array', () => {
    const state = _createState(() => {});
    let cleaned = false;
    state.effects.push({
      cleanup: () => {
        cleaned = true;
      },
      deps: [],
    });

    _cleanupEffects(state);

    expect(cleaned).toBe(true);
    expect(state.effects.length).toBe(0);
  });

  test('handles null entries in sparse effects array', () => {
    const state = _createState(() => {});
    // Simulate sparse array: useState creates a gap at index 0
    state.effects[0] = undefined as unknown as (typeof state.effects)[number];
    state.effects[1] = {
      cleanup: () => {},
      deps: [],
    };

    // Should not throw
    expect(() => _cleanupEffects(state)).not.toThrow();
    expect(state.effects.length).toBe(0);
  });

  test('handles effects with undefined cleanup', () => {
    const state = _createState(() => {});
    state.effects.push({
      cleanup: undefined,
      deps: [],
    });

    expect(() => _cleanupEffects(state)).not.toThrow();
  });
});
