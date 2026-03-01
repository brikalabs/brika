/**
 * Tests for the Bricks context module.
 *
 * Tests setupBricks() directly by providing a mock ContextCore.
 * Mocks brick-hooks and reconciler before importing setupBricks to
 * isolate the module under test.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { type ComponentNode, MUT, type Mutation } from '@brika/ui-kit';
import { createTestHarness, type Handler, noopMock } from './_test-utils';

// Mock brick-hooks
const mockCreateState = mock((scheduleRender: () => void) => ({
  hooks: [],
  effects: [],
  actionRefs: new Map<
    string,
    {
      current: Handler;
    }
  >(),
  brickSize: {
    width: 2,
    height: 2,
  },
  config: {} as Record<string, unknown>,
  configKeys: null as Set<string> | null,
  scheduleRender,
}));
const mockBeginRender = mock((_state: unknown) => {
  /* noop */
});
const mockEndRender = mock(() => {
  /* noop */
});
const mockCleanupEffects = mock((_state: unknown) => {
  /* noop */
});
const mockFlushEffects = mock(() => {
  /* noop */
});

mock.module('../../brick-hooks', () => ({
  _createState: mockCreateState,
  _beginRender: mockBeginRender,
  _endRender: mockEndRender,
  _cleanupEffects: mockCleanupEffects,
  _flushEffects: mockFlushEffects,
}));

// Mock reconciler
const mockReconcile = mock((_oldNodes: unknown[], _newNodes: unknown[]): Mutation[] => {
  return [
    [
      MUT.CREATE,
      '0',
      {
        type: 'text',
        content: 'test',
      } as ComponentNode,
    ],
  ];
});

mock.module('../../reconciler', () => ({
  reconcile: mockReconcile,
}));

// Import setupBricks AFTER mocks are in place
const { setupBricks } = await import('../../context/bricks');

// ─── Test Harness ────────────────────────────────────────────────────────────

const h = createTestHarness({
  bricks: [
    {
      id: 'test-brick',
    },
  ],
});

// ─── Mock component ──────────────────────────────────────────────────────────

const mockComponent = mock((_ctx: { instanceId: string; config: Record<string, unknown> }) => {
  return {
    type: 'text' as const,
    content: 'Hello',
  };
});

function makeBrickType(overrides?: { id?: string; component?: Handler }) {
  return {
    spec: {
      id: overrides?.id ?? 'test-brick',
      families: [
        'sm',
        'md',
      ] as ('sm' | 'md')[],
      config: [
        {
          name: 'title',
          type: 'string',
          label: 'Title',
        },
      ],
    },
    component: (overrides?.component ?? mockComponent) as unknown,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('setupBricks', () => {
  let methods: ReturnType<typeof setupBricks>['methods'];
  let stop: ReturnType<typeof setupBricks>['stop'];

  beforeEach(() => {
    h.reset();

    mockReconcile.mockClear();
    mockCreateState.mockClear();
    mockBeginRender.mockClear();
    mockEndRender.mockClear();
    mockCleanupEffects.mockClear();
    mockFlushEffects.mockClear();
    mockComponent.mockClear();

    // Reset mockReconcile to default behavior
    mockReconcile.mockImplementation((_old: unknown[], _new: unknown[]) => {
      return [
        [
          MUT.CREATE,
          '0',
          {
            type: 'text',
            content: 'test',
          } as ComponentNode,
        ],
      ];
    });

    const result = setupBricks(h.core);
    methods = result.methods;
    stop = result.stop;
  });

  afterEach(async () => {
    // Drain any pending debounce timers (50ms + margin)
    await new Promise((r) => setTimeout(r, 60));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // registerBrickType
  // ─────────────────────────────────────────────────────────────────────────

  describe('registerBrickType', () => {
    test('registers a brick type and sends IPC', () => {
      methods.registerBrickType(makeBrickType() as never);

      expect(h.client.send).toHaveBeenCalledTimes(1);
      const [def, payload] = (h.client.send.mock.calls[0] ?? []) as [
        {
          name: string;
        },
        {
          brickType: {
            id: string;
          };
        },
      ];
      expect(def.name).toBe('registerBrickType');
      expect(payload.brickType.id).toBe('test-brick');
    });

    test('throws for undeclared brick', () => {
      expect(() =>
        methods.registerBrickType(
          makeBrickType({
            id: 'unknown-brick',
          }) as never
        )
      ).toThrow('Brick "unknown-brick" not in package.json');
    });

    test('throws for duplicate brick type registration', () => {
      methods.registerBrickType(makeBrickType() as never);

      expect(() => methods.registerBrickType(makeBrickType() as never)).toThrow(
        'Brick type "test-brick" already registered'
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mountBrickInstance
  // ─────────────────────────────────────────────────────────────────────────

  describe('mountBrickInstance', () => {
    beforeEach(() => {
      methods.registerBrickType(makeBrickType() as never);
      // Clear the send from registerBrickType
      h.sentMessages.length = 0;
      h.client.send.mockClear();
      mockReconcile.mockClear();
    });

    test('creates state and renders immediately', () => {
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      expect(mockCreateState).toHaveBeenCalled();
      expect(mockBeginRender).toHaveBeenCalled();
      expect(mockComponent).toHaveBeenCalledTimes(1);
      expect(mockEndRender).toHaveBeenCalled();
    });

    test('extracts local ID from full type', () => {
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      expect(mockComponent).toHaveBeenCalledTimes(1);
      const callArg = mockComponent.mock.calls[0]?.[0];
      if (callArg === undefined) {
        throw new Error('expected callArg');
      }
      expect(callArg.instanceId).toBe('i1');
    });

    test('ignores unknown brick type', () => {
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:nonexistent',
        w: 2,
        h: 2,
        config: {},
      });

      expect(mockComponent).not.toHaveBeenCalled();
    });

    test('ignores duplicate mount', () => {
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      mockComponent.mockClear();

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 4,
        h: 4,
        config: {},
      });

      expect(mockComponent).not.toHaveBeenCalled();
    });

    test('sends patch on initial render when reconcile returns mutations', () => {
      mockReconcile.mockReturnValueOnce([
        [
          MUT.CREATE,
          '0',
          {
            type: 'text',
            content: 'Hello',
          } as ComponentNode,
        ],
      ]);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      const patchMsg = h.sentMessages.find((m) => m.name === 'patchBrickInstance');
      expect(patchMsg).toBeDefined();
      expect(
        (
          patchMsg?.payload as {
            instanceId: string;
          }
        ).instanceId
      ).toBe('i1');
    });

    test('skips patch when no mutations', () => {
      mockReconcile.mockReturnValueOnce([]);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      const patchMsg = h.sentMessages.find((m) => m.name === 'patchBrickInstance');
      expect(patchMsg).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // resizeBrickInstance
  // ─────────────────────────────────────────────────────────────────────────

  describe('resizeBrickInstance', () => {
    beforeEach(() => {
      methods.registerBrickType(makeBrickType() as never);
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });
      mockComponent.mockClear();
      mockBeginRender.mockClear();
      mockEndRender.mockClear();
    });

    test('re-renders on resize', () => {
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 6,
        h: 4,
      });

      expect(mockComponent).toHaveBeenCalledTimes(1);
      expect(mockBeginRender).toHaveBeenCalled();
      expect(mockEndRender).toHaveBeenCalled();
    });

    test('ignores unknown instance', () => {
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'nonexistent',
        w: 4,
        h: 4,
      });

      expect(mockComponent).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateBrickConfig
  // ─────────────────────────────────────────────────────────────────────────

  describe('updateBrickConfig', () => {
    beforeEach(() => {
      methods.registerBrickType(makeBrickType() as never);
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {
          title: 'Old',
        },
      });
      mockComponent.mockClear();
    });

    test('re-renders with new config', () => {
      h.onHandlers.get('updateBrickConfig')?.({
        instanceId: 'i1',
        config: {
          title: 'New',
        },
      });

      expect(mockComponent).toHaveBeenCalledTimes(1);
      const callArg = mockComponent.mock.calls[0]?.[0];
      if (callArg === undefined) {
        throw new Error('expected callArg');
      }
      expect(callArg.config).toEqual({
        title: 'New',
      });
    });

    test('ignores unknown instance', () => {
      h.onHandlers.get('updateBrickConfig')?.({
        instanceId: 'nonexistent',
        config: {
          title: 'Nope',
        },
      });

      expect(mockComponent).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // unmountBrickInstance
  // ─────────────────────────────────────────────────────────────────────────

  describe('unmountBrickInstance', () => {
    beforeEach(() => {
      methods.registerBrickType(makeBrickType() as never);
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });
      mockCleanupEffects.mockClear();
      mockComponent.mockClear();
    });

    test('cleans up effects and removes instance', () => {
      h.onHandlers.get('unmountBrickInstance')?.({
        instanceId: 'i1',
      });

      expect(mockCleanupEffects).toHaveBeenCalled();

      // Instance should be gone — resize should be a no-op
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 4,
        h: 4,
      });
      expect(mockComponent).not.toHaveBeenCalled();
    });

    test('ignores unknown instance', () => {
      h.onHandlers.get('unmountBrickInstance')?.({
        instanceId: 'nonexistent',
      });
      // Should not throw
      expect(mockCleanupEffects).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // brickInstanceAction
  // ─────────────────────────────────────────────────────────────────────────

  describe('brickInstanceAction', () => {
    test('dispatches to action ref and re-renders', () => {
      const actionHandler = mock(() => {}) as unknown as Handler;

      mockCreateState.mockImplementationOnce((scheduleRender: () => void) => ({
        hooks: [],
        effects: [],
        actionRefs: new Map([
          [
            'toggle',
            {
              current: actionHandler,
            },
          ],
        ]),
        brickSize: {
          width: 2,
          height: 2,
        },
        config: {} as Record<string, unknown>,
        configKeys: null as Set<string> | null,
        scheduleRender,
      }));

      methods.registerBrickType(makeBrickType() as never);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      mockComponent.mockClear();

      h.onHandlers.get('brickInstanceAction')?.({
        instanceId: 'i1',
        actionId: 'toggle',
        payload: {
          checked: true,
        },
      });

      expect(actionHandler).toHaveBeenCalledWith({
        checked: true,
      });
      expect(mockComponent).toHaveBeenCalledTimes(1);
    });

    test('ignores unknown instance', () => {
      methods.registerBrickType(makeBrickType() as never);

      h.onHandlers.get('brickInstanceAction')?.({
        instanceId: 'nonexistent',
        actionId: 'toggle',
      });

      // Should not throw, no render
      expect(mockComponent).not.toHaveBeenCalled();
    });

    test('ignores unknown action', () => {
      methods.registerBrickType(makeBrickType() as never);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      mockComponent.mockClear();

      h.onHandlers.get('brickInstanceAction')?.({
        instanceId: 'i1',
        actionId: 'nonexistent-action',
      });

      // No re-render since action ref not found
      expect(mockComponent).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Debounced patch
  // ─────────────────────────────────────────────────────────────────────────

  describe('debounced patch', () => {
    beforeEach(() => {
      methods.registerBrickType(makeBrickType() as never);
      h.sentMessages.length = 0;
      h.client.send.mockClear();
    });

    test('subsequent renders use debounce', async () => {
      // Initial mount: immediate render
      mockReconcile.mockReturnValueOnce([
        [
          MUT.CREATE,
          '0',
          {
            type: 'text',
            content: 'V',
          } as ComponentNode,
        ],
      ]);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      const patchCountAfterMount = h.sentMessages.filter(
        (m) => m.name === 'patchBrickInstance'
      ).length;
      expect(patchCountAfterMount).toBe(1);

      // Resize triggers debounced render (not immediate)
      mockReconcile.mockReturnValueOnce([
        [
          MUT.UPDATE,
          '0',
          {
            value: 'V2',
          },
        ],
      ]);
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 4,
        h: 4,
      });

      // Patch should NOT be sent immediately
      const patchCountAfterResize = h.sentMessages.filter(
        (m) => m.name === 'patchBrickInstance'
      ).length;
      expect(patchCountAfterResize).toBe(patchCountAfterMount);

      // Wait for debounce timer (50ms + margin)
      await new Promise((r) => setTimeout(r, 100));

      const patchCountAfterDebounce = h.sentMessages.filter(
        (m) => m.name === 'patchBrickInstance'
      ).length;
      expect(patchCountAfterDebounce).toBe(patchCountAfterMount + 1);
    });

    test('debounce skips send when no mutations', async () => {
      mockReconcile
        .mockReturnValueOnce([
          [
            MUT.CREATE,
            '0',
            {
              type: 'text',
              content: 'V',
            } as ComponentNode,
          ],
        ])
        .mockReturnValueOnce([]); // No changes for debounced reconcile

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      const patchCountAfterMount = h.sentMessages.filter(
        (m) => m.name === 'patchBrickInstance'
      ).length;

      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 4,
        h: 4,
      });

      await new Promise((r) => setTimeout(r, 100));

      const patchCountAfter = h.sentMessages.filter((m) => m.name === 'patchBrickInstance').length;
      expect(patchCountAfter).toBe(patchCountAfterMount);
    });

    test('unmount clears pending debounce timer', async () => {
      mockReconcile.mockReturnValue([
        [
          MUT.CREATE,
          '0',
          {
            type: 'text',
            content: 'V',
          } as ComponentNode,
        ],
      ]);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      // Resize triggers debounce
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 4,
        h: 4,
      });

      const patchCountBefore = h.sentMessages.filter((m) => m.name === 'patchBrickInstance').length;

      // Unmount before debounce fires
      h.onHandlers.get('unmountBrickInstance')?.({
        instanceId: 'i1',
      });

      // Wait for what would have been the debounce timer
      await new Promise((r) => setTimeout(r, 100));

      const patchCountAfter = h.sentMessages.filter((m) => m.name === 'patchBrickInstance').length;
      expect(patchCountAfter).toBe(patchCountBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stop()
  // ─────────────────────────────────────────────────────────────────────────

  describe('stop', () => {
    test('unmounts all instances', () => {
      methods.registerBrickType(makeBrickType() as never);

      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i1',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });
      h.onHandlers.get('mountBrickInstance')?.({
        instanceId: 'i2',
        brickTypeId: 'test-plugin:test-brick',
        w: 2,
        h: 2,
        config: {},
      });

      mockCleanupEffects.mockClear();

      stop();

      expect(mockCleanupEffects).toHaveBeenCalledTimes(2);

      // Instances should be gone — resize should be a no-op
      mockComponent.mockClear();
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i1',
        w: 4,
        h: 4,
      });
      h.onHandlers.get('resizeBrickInstance')?.({
        instanceId: 'i2',
        w: 4,
        h: 4,
      });
      expect(mockComponent).not.toHaveBeenCalled();
    });
  });
});
