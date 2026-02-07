import type { BaseNode } from './_shared';

export interface ButtonNode extends BaseNode {
  type: 'button';
  label: string;
  onPress: string;
  icon?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  color?: string;
}

export function Button(props: Omit<ButtonNode, 'type'>): ButtonNode {
  return { type: 'button', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    button: ButtonNode;
  }
}
