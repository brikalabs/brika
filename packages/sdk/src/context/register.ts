/**
 * Context Module Registration System
 *
 * Inspired by the self-registering pattern in @brika/archunit.
 * Each module calls registerContextModule() at import time to register
 * its setup function. When Context is constructed, initAllModules() runs
 * all registered setups and applies their methods to the Context instance.
 */

import type { BlockSchema, BrickSchema, PageSchema, SparkSchema } from '@brika/schema/plugin';
import { PRELUDE_BRAND, type PreludeBridge } from '../bridge';
import type { AnyObj, LogLevel } from '../types';

export type { LogLevel } from '../types';

/** Get the prelude bridge or throw if not loaded. */
export function requireBridge(): PreludeBridge {
  const bridge = globalThis.__brika_ipc;
  if (!bridge || !(PRELUDE_BRAND in bridge)) {
    throw new Error('Prelude bridge not found. SDK requires the hub prelude to be loaded.');
  }
  return bridge;
}

// ─── Types ────────────────────────────────────────────────────────────────────
// Manifest entry shapes come from `@brika/schema` (the single source of truth);
// the Decl aliases keep this module's historical names for its consumers.

export type BlockDecl = BlockSchema;

export type SparkDecl = SparkSchema;

export type BrickDecl = BrickSchema;

export type PageDecl = PageSchema;

export interface Manifest {
  name: string;
  version: string;
  blocks?: BlockDecl[];
  sparks?: SparkDecl[];
  bricks?: BrickDecl[];
  pages?: PageDecl[];
}

/** Shared core passed to every module setup function. */
export interface ContextCore {
  readonly manifest: Manifest;
  log(level: LogLevel, message: string, meta?: AnyObj): void;
}

type AnyFn = (...args: never[]) => unknown;

/** Return value from a module's setup function. */
export interface ModuleResult {
  /** Methods to add to the Context instance. */
  methods?: Record<string, AnyFn>;
}

export type SetupFn = (core: ContextCore) => ModuleResult;

/** Extract method types from a setup function for use in declare module augmentation. */
export type MethodsOf<
  T extends (...args: never[]) => {
    methods?: Record<string, AnyFn>;
  },
> = NonNullable<ReturnType<T>['methods']>;

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry: Array<{
  name: string;
  setup: SetupFn;
}> = [];

/** Register a context module. Called at import time by each module file. */
export function registerContextModule(name: string, setup: SetupFn): void {
  registry.push({
    name,
    setup,
  });
}

/**
 * Initialize all registered modules and apply their methods to the target.
 */
export function initAllModules(core: ContextCore, target: object): void {
  for (const { setup } of registry) {
    const result = setup(core);
    if (result.methods) {
      for (const [key, fn] of Object.entries(result.methods)) {
        (target as Record<string, unknown>)[key] = fn;
      }
    }
  }
}
