import type { ComponentNode, NodeTypeMap } from '@brika/ui-kit';
import { type FC, memo } from 'react';

export type ActionHandler = (actionId: string, payload?: Record<string, unknown>) => void;

export type NodeRenderer<T = any> = FC<{ node: T; onAction?: ActionHandler }>;

/** Internal record — populated by index.ts at module init */
const renderers: Record<string, NodeRenderer> = {};

/**
 * Type-safe registration: ensures the renderer's node prop matches the registered type key.
 * If you register `'toggle'`, TypeScript enforces the renderer accepts `{ node: ToggleNode }`.
 */
export function register<K extends keyof NodeTypeMap>(
  type: K,
  renderer: NodeRenderer<NodeTypeMap[K]>
): void {
  renderers[type] = renderer as NodeRenderer;
}

/** Dispatcher: looks up the renderer for a node type and renders it */
export const ComponentNodeRenderer = memo(function ComponentNodeRenderer({
  node,
  onAction,
}: {
  node: ComponentNode;
  onAction?: ActionHandler;
}) {
  const Renderer = renderers[node.type];
  if (!Renderer) return null;
  return <Renderer node={node} onAction={onAction} />;
});
