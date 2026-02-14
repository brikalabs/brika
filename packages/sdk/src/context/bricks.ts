/**
 * Bricks Module
 *
 * Handles brick type registration, instance lifecycle (mount/unmount/resize/config/action),
 * rendering pipeline, and debounced patch sending.
 * Self-registers with the context module system.
 */

import {
  brickInstanceAction as brickInstanceActionMsg,
  mountBrickInstance,
  patchBrickInstance as patchBrickInstanceMsg,
  registerBrickType as registerBrickTypeMsg,
  resizeBrickInstance,
  unmountBrickInstance,
  updateBrickConfig,
} from '@brika/ipc/contract';
import type { BrickInstanceContext, CompiledBrickType, ComponentNode } from '@brika/ui-kit';
import {
  _beginRender,
  _cleanupEffects,
  _createState,
  _endRender,
  type BrickState,
} from '../brick-hooks';
import { reconcile } from '../reconciler';
import { type ContextCore, type MethodsOf, registerContextModule } from './register';

// ─── Internal Types ───────────────────────────────────────────────────────────

interface BrickInstanceState {
  instanceId: string;
  brickTypeId: string;
  w: number;
  h: number;
  config: Record<string, unknown>;
  hookState: BrickState;
  sentBody: ComponentNode[];
  pendingBody: ComponentNode[] | null;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBricks(core: ContextCore) {
  const { client, manifest } = core;
  const declaredBricks = new Set(manifest.bricks?.map((c) => c.id) ?? []);
  const brickTypes = new Map<string, CompiledBrickType>();
  const brickInstances = new Map<string, BrickInstanceState>();
  const brickPatchTimers = new Map<string, Timer>();

  // ─── Render helpers ─────────────────────────────────────────────────

  function debouncePatch(state: BrickInstanceState): void {
    const existing = brickPatchTimers.get(state.instanceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      brickPatchTimers.delete(state.instanceId);
      if (!state.pendingBody) return;

      const mutations = reconcile(state.sentBody, state.pendingBody);
      if (mutations.length > 0) {
        state.sentBody = state.pendingBody;
        client.send(patchBrickInstanceMsg, {
          instanceId: state.instanceId,
          mutations: mutations as unknown[],
        });
      }
      state.pendingBody = null;
    }, 50);
    brickPatchTimers.set(state.instanceId, timer);
  }

  function renderInstance(state: BrickInstanceState, immediate = false): void {
    const brickType = brickTypes.get(state.brickTypeId);
    if (!brickType) return;

    state.hookState.brickSize = { width: state.w, height: state.h };
    state.hookState.config = state.config;
    state.hookState.configKeys ??= new Set(brickType.spec.config?.map((c) => c.name));
    _beginRender(state.hookState);
    try {
      const ctx: BrickInstanceContext = {
        instanceId: state.instanceId,
        config: state.config,
      };
      const result = brickType.component(ctx);
      const body: ComponentNode[] = Array.isArray(result) ? result : [result];

      if (immediate) {
        const mutations = reconcile(state.sentBody, body);
        if (mutations.length > 0) {
          state.sentBody = body;
          state.pendingBody = null;
          brickPatchTimers.delete(state.instanceId);
          client.send(patchBrickInstanceMsg, {
            instanceId: state.instanceId,
            mutations: mutations as unknown[],
          });
        }
      } else {
        state.pendingBody = body;
        debouncePatch(state);
      }
    } catch (err) {
      console.error(
        `[brick:${state.brickTypeId}] Render error in instance ${state.instanceId}:`,
        err
      );
    } finally {
      _endRender();
    }
  }

  function mountInstance(
    instanceId: string,
    brickTypeId: string,
    w: number,
    h: number,
    config: Record<string, unknown>
  ): void {
    if (brickInstances.has(instanceId)) return;

    const brickType = brickTypes.get(brickTypeId);
    if (!brickType) return;

    const state: BrickInstanceState = {
      instanceId,
      brickTypeId,
      w,
      h,
      config,
      hookState: _createState(() => renderInstance(state)),
      sentBody: [],
      pendingBody: null,
    };

    brickInstances.set(instanceId, state);
    renderInstance(state, true);
  }

  function unmountInstance(instanceId: string): void {
    const state = brickInstances.get(instanceId);
    if (!state) return;

    _cleanupEffects(state.hookState);

    const timer = brickPatchTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      brickPatchTimers.delete(instanceId);
    }

    brickInstances.delete(instanceId);
  }

  // ─── IPC handlers ──────────────────────────────────────────────────

  client.on(mountBrickInstance, ({ instanceId, brickTypeId, w, h, config }) => {
    const colonIndex = brickTypeId.indexOf(':');
    const localId = colonIndex >= 0 ? brickTypeId.slice(colonIndex + 1) : brickTypeId;
    mountInstance(instanceId, localId, w, h, config);
  });

  client.on(resizeBrickInstance, ({ instanceId, w, h }) => {
    const state = brickInstances.get(instanceId);
    if (!state) return;
    state.w = w;
    state.h = h;
    renderInstance(state);
  });

  client.on(updateBrickConfig, ({ instanceId, config }) => {
    const state = brickInstances.get(instanceId);
    if (!state) return;
    state.config = config;
    state.hookState.config = state.config;
    renderInstance(state);
  });

  client.on(unmountBrickInstance, ({ instanceId }) => {
    unmountInstance(instanceId);
  });

  client.on(brickInstanceActionMsg, ({ instanceId, actionId, payload }) => {
    const state = brickInstances.get(instanceId);
    if (!state) return;

    const ref = state.hookState.actionRefs.get(actionId);
    if (ref) {
      ref.current(payload as Record<string, unknown> | undefined);
      renderInstance(state);
    }
  });

  return {
    methods: {
      registerBrickType(brick: CompiledBrickType): void {
        const { id } = brick.spec;
        if (!declaredBricks.has(id)) {
          throw new Error(`Brick "${id}" not in package.json. Add: "bricks": [{"id": "${id}"}]`);
        }
        if (brickTypes.has(id)) throw new Error(`Brick type "${id}" already registered`);

        brickTypes.set(id, brick);
        client.send(registerBrickTypeMsg, {
          brickType: {
            id,
            families: brick.spec.families,
            minSize: brick.spec.minSize,
            maxSize: brick.spec.maxSize,
            config: brick.spec.config as unknown[] | undefined,
          },
        });
      },
    },

    stop() {
      const instanceIds = Array.from(brickInstances.keys());
      for (const instanceId of instanceIds) {
        unmountInstance(instanceId);
      }
    },
  };
}

// ─── Type Augmentation (inferred from setup) ─────────────────────────────────

declare module '../context' {
  interface Context extends MethodsOf<typeof setupBricks> {}
}

registerContextModule('bricks', setupBricks);
