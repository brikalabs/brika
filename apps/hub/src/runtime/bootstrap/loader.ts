import type { BrikaConfig } from '@/runtime/config';

/**
 * Loader interface for bootstrapping system components.
 * Each loader is responsible for initializing and loading a specific subsystem.
 */
export interface Loader {
  /**
   * Optional initialization step (e.g., creating directories, connections).
   * Called before load().
   */
  init?(): Promise<void>;

  /**
   * Load/configure the subsystem from config.
   */
  load(config: BrikaConfig): Promise<void>;

  /**
   * Optional cleanup step.
   * Called during shutdown.
   */
  stop?(): Promise<void>;

  /**
   * Loader name for logging.
   */
  readonly name: string;
}
