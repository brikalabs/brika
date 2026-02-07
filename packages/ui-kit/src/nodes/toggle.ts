import type { BaseNode } from './_shared';

export interface ToggleNode extends BaseNode {
  type: 'toggle';
  label: string;
  checked: boolean;
  onToggle: string;
  icon?: string;
  color?: string;
}

export function Toggle(props: Omit<ToggleNode, 'type'>): ToggleNode {
  return { type: 'toggle', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    toggle: ToggleNode;
  }
}
