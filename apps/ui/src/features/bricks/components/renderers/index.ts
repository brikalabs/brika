// Auto-discover all renderer modules — each self-registers via defineRenderer()
import.meta.glob('./*.tsx', { eager: true });

export type { ActionHandler, NodeRenderer } from './registry';
export { ComponentNodeRenderer, defineRenderer } from './registry';
