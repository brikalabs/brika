import type { ComponentNode } from './nodes';

export interface ActionNode {
  id: string;
  label?: string;
  icon?: string;
}

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
