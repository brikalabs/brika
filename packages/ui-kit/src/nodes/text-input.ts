import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface TextInputNode extends BaseNode {
  type: 'text-input';
  /** Current value */
  value: string;
  /** Placeholder text */
  placeholder?: string;
  /** Label above the input */
  label?: string;
  /** Lucide icon name (left side) */
  icon?: string;
  /** Action dispatched when value changes (debounced) */
  onChange: string;
  /** Action dispatched on Enter key */
  onSubmit?: string;
  /** Disable the input */
  disabled?: boolean;
  /** Input type */
  inputType?: 'text' | 'password' | 'email' | 'number';
  /** Render as textarea instead of input */
  multiline?: boolean;
  /** Number of visible rows when multiline (default 3) */
  rows?: number;
}

export function TextInput(props: {
  value: string;
  placeholder?: string;
  label?: string;
  icon?: string;
  onChange: ActionHandler;
  onSubmit?: ActionHandler;
  disabled?: boolean;
  inputType?: 'text' | 'password' | 'email' | 'number';
  multiline?: boolean;
  rows?: number;
}): TextInputNode {
  const { onChange, onSubmit, ...rest } = props;
  return {
    type: 'text-input',
    ...rest,
    onChange: resolveAction(onChange),
    onSubmit: onSubmit ? resolveAction(onSubmit) : undefined,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    'text-input': TextInputNode;
  }
}
