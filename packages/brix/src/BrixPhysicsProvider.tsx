/**
 * `<BrixPhysicsProvider>` + `useBrixImpulse` — shares a single live
 * physics simulation across the Brix subtree.
 *
 *   <EmoteProvider>
 *     <BrixPhysicsProvider>
 *       <BrixStage … />       // automatically picks up the offset
 *       <SomeButton onClick={() => useBrixImpulse().impulse(5, 12)} />
 *     </BrixPhysicsProvider>
 *   </EmoteProvider>
 *
 * Why a provider instead of having every caller wire up
 * `useBrixPhysics()` themselves? Two reasons:
 *
 *   1. The mascot and the impulse source are usually in different
 *      branches of the tree. The provider lets them share state without
 *      drilling props.
 *   2. `<BrixStage>` reads the offset internally — consumers stop
 *      having to wrap the stage in a Box with margin tricks just to
 *      show a knockback. Push an impulse, the stage does the rest.
 *
 * The provider is optional. `BrixStage` works without one (offset is
 * `{0, 0}`); `useBrixImpulse` falls back to a no-op api so the same
 * call sites compile and render whether or not a provider is present.
 */

import { createContext, type PropsWithChildren, type ReactElement, useContext } from 'react';
import { type BrixPhysicsApi, useBrixPhysics, type UseBrixPhysicsOptions } from './useBrixPhysics';

const NOOP_API: BrixPhysicsApi = {
  state: {
    cx: 7,
    vx: 0,
    y: 0,
    vy: 0,
    w: 5,
    h: 3,
    grounded: true,
  },
  offset: { x: 0, y: 0 },
  impulse: () => {
    /* no provider in scope — silently swallow so call sites still work */
  },
  reset: () => {
    /* same */
  },
};

const BrixPhysicsContext = createContext<BrixPhysicsApi>(NOOP_API);

export interface BrixPhysicsProviderProps extends UseBrixPhysicsOptions {}

export function BrixPhysicsProvider(
  props: Readonly<PropsWithChildren<BrixPhysicsProviderProps>>
): ReactElement {
  const { children, ...opts } = props;
  const api = useBrixPhysics(opts);
  return <BrixPhysicsContext.Provider value={api}>{children}</BrixPhysicsContext.Provider>;
}

/** Read the full physics api (`state`, `offset`, `impulse`, `reset`).
 *  Falls back to a no-op api when no provider is in scope so call
 *  sites don't have to guard. */
export function useBrixImpulse(): BrixPhysicsApi {
  return useContext(BrixPhysicsContext);
}
