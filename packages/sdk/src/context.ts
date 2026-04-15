/**
 * Plugin Context -- Thin Loader
 *
 * Constructs the singleton Context, delegates domain logic to
 * self-registering modules under ./context/.
 */

import type { PreludeBridge } from './bridge';
import type { AnyObj } from './types';

// Trigger all module registrations (sparks, routes, blocks, bricks, lifecycle)
import './context/index';

import {
  type ContextCore,
  initAllModules,
  type LogLevel,
  type Manifest,
  requireBridge,
} from './context/register';

// ─── Context ──────────────────────────────────────────────────────────────────

export type StopHandler = () => void | Promise<void>;

export class Context {
  readonly #manifest: Manifest;
  readonly #bridge: PreludeBridge;
  #started = false;

  constructor() {
    this.#bridge = requireBridge();
    this.#manifest = this.#bridge.getManifest();

    // Build core and wire up all modules
    const core: ContextCore = {
      manifest: this.#manifest,
      log: (level, message, meta) => this.log(level, message, meta),
    };

    initAllModules(core, this);

    // Auto-start on next tick if not started manually
    process.nextTick(() => {
      if (!this.#started) {
        this.start();
      }
    });
  }

  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#bridge.start();
  }

  log(level: LogLevel, message: string, meta?: AnyObj): void {
    this.#bridge.log(level, message, meta);
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

export type { LogLevel, Manifest } from './context/register';
