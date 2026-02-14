import type { ComponentNode, NodeTypeMap } from '@brika/ui-kit';
import { type FC, memo } from 'react';

export type ActionHandler = (actionId: string, payload?: Record<string, unknown>) => void;

export type NodeRenderer<T = any> = FC<{ node: T; onAction?: ActionHandler }>;

/** Internal record — populated at module init by each renderer's register() call */
const renderers: Record<string, NodeRenderer> = {};

/**
 * Type-safe registration: ensures the renderer's node prop matches the registered type key.
 * If you register `'toggle'`, TypeScript enforces the renderer accepts `{ node: ToggleNode }`.
 */
export function register<K extends keyof NodeTypeMap>(
  type: K,
  renderer: NodeRenderer<NodeTypeMap[K]>
): void {
  renderers[type] = renderer;
}

/**
 * Define and register a renderer in one call. Wraps memo() + register().
 * Types are inferred from the NodeTypeMap key — no manual type annotations needed.
 */
export function defineRenderer<K extends keyof NodeTypeMap>(
  type: K,
  renderer: FC<{ node: NodeTypeMap[K]; onAction?: ActionHandler }>
): void {
  const Memoized = memo(renderer);
  Memoized.displayName = `${String(type)}Renderer`;
  renderers[type] = Memoized as NodeRenderer;
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
  if (!Renderer) {
    console.warn(`[bricks] No renderer registered for node type "${node.type}"`);
    return null;
  }
  return <Renderer node={node} onAction={onAction} />;
});
