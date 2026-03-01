import type { ComponentNode } from './nodes';

export interface ActionNode {
  id: string;
  label?: string;
  icon?: string;
}

export const MUT = {
  CREATE: 0,
  REPLACE: 1,
  UPDATE: 2,
  REMOVE: 3,
} as const;

export type Mutation =
  | [
      op: 0,
      path: string,
      node: ComponentNode,
    ]
  | [
      op: 1,
      path: string,
      node: ComponentNode,
    ]
  | [
      op: 2,
      path: string,
      changes: Record<string, unknown>,
      removed?: string[],
    ]
  | [
      op: 3,
      path: string,
    ];

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
