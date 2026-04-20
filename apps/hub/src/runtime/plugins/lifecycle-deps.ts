/**
 * Re-export external dependencies used by PluginLifecycle.
 *
 * Tests mock THIS file instead of @brika/compiler, @brika/ipc, or
 * ./plugin-process directly, preventing Bun's mock.module() bleed
 * (oven-sh/bun#12823).
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as compiler from '@brika/compiler';
import * as ipc from '@brika/ipc';
import * as pp from './plugin-process';

export const { compileServerEntry } = compiler;
export const { spawnPlugin } = ipc;
export const { PluginProcess } = pp;
export type PluginProcess = pp.PluginProcess;
