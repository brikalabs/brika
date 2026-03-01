/**
 * Context Type Augmentations
 *
 * Consolidates all `declare module` augmentations for the Context class.
 * Each context module (sparks, routes, blocks, etc.) registers methods at
 * runtime via registerContextModule(). This file provides the compile-time
 * type information so TypeScript knows about those methods.
 *
 * This file is imported by the SDK entry point (src/index.ts), NOT by
 * context.ts or context/index.ts, to avoid import cycles.
 */

import type { setupActions } from './actions';
import type { setupBlocks } from './blocks';
import type { setupBricks } from './bricks';
import type { setupI18n } from './i18n';
import type { setupLifecycle } from './lifecycle';
import type { setupLocation } from './location';
import type { MethodsOf } from './register';
import type { setupRoutes } from './routes';
import type { setupSparks } from './sparks';

declare module '../context' {
  interface Context
    extends MethodsOf<typeof setupActions>,
      MethodsOf<typeof setupBlocks>,
      MethodsOf<typeof setupBricks>,
      MethodsOf<typeof setupI18n>,
      MethodsOf<typeof setupLifecycle>,
      MethodsOf<typeof setupLocation>,
      MethodsOf<typeof setupRoutes>,
      MethodsOf<typeof setupSparks> {}
}
