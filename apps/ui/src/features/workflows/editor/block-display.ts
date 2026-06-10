/**
 * Shared block presentation helpers for the toolbar, pickers, and palette.
 */

import type { BlockDefinition } from './BlockToolbar';

type Translate = (pluginId: string, key: string, fallback?: string) => string;

/** Locale-resolved display name of a block (falls back to manifest name/key). */
export function blockDisplayName(tp: Translate, block: BlockDefinition): string {
  const blockKey = block.id.split(':').pop() || block.id;
  return tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
}
