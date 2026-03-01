import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectNode extends BaseNode {
  type: 'select';
  /** Currently selected value */
  value: string;
  /** Available options */
  options: SelectOption[];
  /** Optional label above the select */
  label?: string;
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Action dispatched when selection changes */
  onChange: string;
  /** Disable the select */
  disabled?: boolean;
  /** Lucide icon name */
  icon?: string;
}

export function Select(props: {
  value: string;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  onChange: ActionHandler;
  disabled?: boolean;
  icon?: string;
}): SelectNode {
  const { onChange, ...rest } = props;
  return {
    type: 'select',
    ...rest,
    onChange: resolveAction(onChange),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    select: SelectNode;
  }
}
