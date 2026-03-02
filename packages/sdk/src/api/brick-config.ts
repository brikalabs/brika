/**
 * Brick Config API
 *
 * React to per-instance config changes for client-rendered bricks.
 */

import { getContext } from '../context';

export type { BrickConfigChangeHandler } from '../context/bricks';

/**
 * Register a handler called when a brick instance's config changes.
 *
 * The hub pushes config updates when a user edits an instance's settings
 * on the board (e.g. changing the city for a weather brick).
 *
 * @example
 * ```typescript
 * onBrickConfigChange((instanceId, config) => {
 *   if (typeof config.city === 'string') {
 *     ensurePolling(config.city);
 *   }
 * });
 * ```
 */
export function onBrickConfigChange(
  handler: (instanceId: string, config: Record<string, unknown>) => void
): () => void {
  return getContext().onBrickConfigChange(handler);
}
