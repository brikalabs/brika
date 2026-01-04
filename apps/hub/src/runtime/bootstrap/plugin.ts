import type { EliaConfig } from '@/runtime/config';
import type { Bootstrap } from './bootstrap';

/**
 * Bootstrap plugin interface.
 *
 * Plugins can hook into the bootstrap lifecycle to add modular functionality.
 *
 * @example
 * ```ts
 * const myPlugin: BootstrapPlugin = {
 *   name: 'my-plugin',
 *   setup(bootstrap) {
 *     // Configure bootstrap
 *   },
 *   onStart() {
 *     // Called after hub starts
 *   },
 * };
 * ```
 */
export interface BootstrapPlugin {
  /** Plugin name for logging */
  readonly name: string;

  /**
   * Setup hook - called immediately when plugin is registered.
   * Use this to configure the bootstrap instance (e.g., register signal handlers).
   */
  setup?(bootstrap: Bootstrap): void;

  /**
   * Initialization hook - called after config is loaded but before load.
   * Use for async setup like creating directories or connections.
   */
  onInit?(): Promise<void> | void;

  /**
   * Load hook - called with config to load/configure the subsystem.
   */
  onLoad?(config: EliaConfig): Promise<void> | void;

  /**
   * Called after the hub has fully started.
   */
  onStart?(): Promise<void> | void;

  /**
   * Called before the hub stops.
   */
  onStop?(): Promise<void> | void;
}
