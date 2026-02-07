/**
 * Brick Descriptor Types
 *
 * Re-exports node types from the co-located node modules.
 * Non-node types (ActionNode, BrickDescriptor, Mutation) live here.
 */

// Node types (re-exported from nodes/)
export type {
  BaseNode,
  ButtonNode,
  ChartDataPoint,
  ChartNode,
  ComponentNode,
  GridNode,
  ImageNode,
  NodeTypeMap,
  SectionNode,
  SliderNode,
  StackNode,
  StatValueNode,
  StatusNode,
  TextNode,
  ToggleNode,
  VideoNode,
} from '../nodes';

// ─────────────────────────────────────────────────────────────────────────────
// Action Node
// ─────────────────────────────────────────────────────────────────────────────

/** String-based action reference (not a callback — serializable across processes) */
export interface ActionNode {
  id: string;
  label?: string;
  icon?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (reconciler output)
// ─────────────────────────────────────────────────────────────────────────────

import type { ComponentNode } from '../nodes';

/** Reconciler mutation — describes a single change to the component tree */
export type Mutation =
  | { op: 'create'; path: string; node: ComponentNode }
  | { op: 'update'; path: string; props: Record<string, unknown> }
  | { op: 'remove'; path: string };

// ─────────────────────────────────────────────────────────────────────────────
// Brick Descriptor
// ─────────────────────────────────────────────────────────────────────────────

/** Top-level unit that plugins register */
export interface BrickDescriptor {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  size: 'sm' | 'md' | 'lg' | 'xl';
  body: ComponentNode[];
  actions?: ActionNode[];
  category?: string;
  tags?: string[];
}
