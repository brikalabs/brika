/**
 * Context Module Registration System
 *
 * Inspired by the self-registering pattern in @brika/archunit.
 * Each module calls registerContextModule() at import time to register
 * its setup function. When Context is constructed, initAllModules() runs
 * all registered setups and applies their methods to the Context instance.
 */

import type { Client } from '@brika/ipc';
import type { AnyObj } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BlockDecl {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  color?: string;
}

export interface SparkDecl {
  id: string;
  name: string;
  description?: string;
}

export interface BrickDecl {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
}

export interface Manifest {
  name: string;
  version: string;
  blocks?: BlockDecl[];
  sparks?: SparkDecl[];
  bricks?: BrickDecl[];
}

/** Shared core passed to every module setup function. */
export interface ContextCore {
  readonly client: Client;
  readonly manifest: Manifest;
  log(level: LogLevel, message: string, meta?: AnyObj): void;
}

// biome-ignore lint/suspicious/noExplicitAny: generic callable type for method registry
type AnyFn = (...args: any[]) => any;

/** Return value from a module's setup function. */
export interface ModuleResult {
  /** Methods to add to the Context instance. */
  methods?: Record<string, AnyFn>;
  /** Cleanup function called on plugin shutdown. */
  stop?: () => void | Promise<void>;
}

export type SetupFn = (core: ContextCore) => ModuleResult;

/** Extract method types from a setup function for use in declare module augmentation. */
// biome-ignore lint/suspicious/noExplicitAny: generic inference requires any
export type MethodsOf<T extends (...args: any[]) => { methods?: Record<string, AnyFn> }> =
  NonNullable<ReturnType<T>['methods']>;

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry: Array<{ name: string; setup: SetupFn }> = [];

/** Register a context module. Called at import time by each module file. */
export function registerContextModule(name: string, setup: SetupFn): void {
  registry.push({ name, setup });
}

/**
 * Initialize all registered modules, apply their methods to the target,
 * and return an array of stop functions for shutdown.
 */
export function initAllModules(
  core: ContextCore,
  target: object
): Array<() => void | Promise<void>> {
  const stopFns: Array<() => void | Promise<void>> = [];
  for (const { setup } of registry) {
    const result = setup(core);
    if (result.methods) {
      for (const [key, fn] of Object.entries(result.methods)) {
        (target as Record<string, unknown>)[key] = fn;
      }
    }
    if (result.stop) stopFns.push(result.stop);
  }
  return stopFns;
}
