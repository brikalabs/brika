import type { ComponentNode, NodeTypeMap } from '@brika/ui-kit';
import { createElement, type FC, memo } from 'react';

export type ActionHandler = (actionId: string, payload?: Record<string, unknown>) => void;

export type NodeRenderer<T = unknown> = FC<{ node: T; onAction?: ActionHandler }>;
type NodeOf<K extends keyof NodeTypeMap> = Extract<ComponentNode, { type: K }>;

function isNodeType<K extends keyof NodeTypeMap>(node: ComponentNode, type: K): node is NodeOf<K> {
  return node.type === type;
}

/** Internal record — populated at module init by each renderer's register() call */
const renderers: Record<string, NodeRenderer<ComponentNode>> = {};

/**
 * Type-safe registration: ensures the renderer's node prop matches the registered type key.
 * If you register `'toggle'`, TypeScript enforces the renderer accepts `{ node: ToggleNode }`.
 */
export function register<K extends keyof NodeTypeMap>(
  type: K,
  renderer: NodeRenderer<NodeOf<K>>
): void {
  renderers[type] = ({ node, onAction }) => {
    if (!isNodeType(node, type)) return null;
    return createElement(renderer, { node, onAction });
  };
}

/**
 * Define and register a renderer in one call. Wraps memo() + register().
 * Types are inferred from the NodeTypeMap key — no manual type annotations needed.
 */
export function defineRenderer<K extends keyof NodeTypeMap>(
  type: K,
  renderer: FC<{ node: NodeOf<K>; onAction?: ActionHandler }>
): void {
  const Memoized = memo(renderer);
  Memoized.displayName = `${String(type)}Renderer`;
  register(type, Memoized);
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
