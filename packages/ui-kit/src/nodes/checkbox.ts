import { type ActionHandler, type BaseNode, resolveAction } from './_shared';

export interface CheckboxNode extends BaseNode {
  type: 'checkbox';
  label: string;
  checked: boolean;
  /** Action dispatched when toggled */
  onToggle: string;
  /** Optional description below the label */
  description?: string;
  /** Lucide icon name */
  icon?: string;
  disabled?: boolean;
}

export function Checkbox(
  props: Omit<CheckboxNode, 'type' | 'onToggle'> & {
    onToggle: ActionHandler;
  }
): CheckboxNode {
  const { onToggle, ...rest } = props;
  return {
    type: 'checkbox',
    ...rest,
    onToggle: resolveAction(onToggle),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    checkbox: CheckboxNode;
  }
}
