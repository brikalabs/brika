/**
 * Plugin Context — Thin Loader
 *
 * Constructs the singleton Context, delegates domain logic to
 * self-registering modules under ./context/.
 */

import { createClient } from '@brika/ipc';
import { log as logMsg, ping } from '@brika/ipc/contract';

import type { AnyObj } from './types';

// Trigger all module registrations (sparks, routes, blocks, bricks, lifecycle)
import './context/index';

import { loadManifest } from './context/manifest';
import { type ContextCore, initAllModules, type LogLevel, type Manifest } from './context/register';

// ─── Context ──────────────────────────────────────────────────────────────────

export type StopHandler = () => void | Promise<void>;

export class Context {
  readonly #manifest: Manifest;
  readonly #client: ReturnType<typeof createClient>;
  #started = false;

  constructor() {
    this.#manifest = loadManifest();
    this.#client = createClient();

    // Ping/pong for health checks
    this.#client.implement(ping, ({ ts }) => ({ ts }));

    // Build core and wire up all modules
    const core: ContextCore = {
      client: this.#client,
      manifest: this.#manifest,
      log: (level, message, meta) => this.log(level, message, meta),
    };

    const stopFns = initAllModules(core, this);

    // Shutdown: modules stop in order, then user stop handlers
    this.#client.onStop(async () => {
      for (const fn of stopFns) await fn();
    });

    // Auto-start on next tick if not started manually
    process.nextTick(() => {
      if (!this.#started) this.start();
    });
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#client.start({ id: this.#manifest.name, version: this.#manifest.version });
  }

  log(level: LogLevel, message: string, meta?: AnyObj): void {
    this.#client.send(logMsg, { level, message, meta });
  }

  getPluginName(): string {
    return this.#manifest.name;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let ctx: Context | null = null;

export function getContext(): Context {
  if (!ctx) {
    if (typeof process.send !== 'function') {
      throw new TypeError('SDK only works in plugin processes spawned by BRIKA hub');
    }
    ctx = new Context();
  }
  return ctx;
}

export type { LogLevel, Manifest };
