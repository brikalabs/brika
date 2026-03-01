import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface ToggleNode extends BaseNode {
  type: 'toggle';
  label: string;
  checked: boolean;
  onToggle: string;
  icon?: string;
  color?: ColorValue;
  /** Disable the toggle */
  disabled?: boolean;
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  onToggle: ActionHandler;
  icon?: string;
  color?: ColorValue;
  disabled?: boolean;
}): ToggleNode {
  const { onToggle, ...rest } = props;
  return {
    type: 'toggle',
    ...rest,
    onToggle: resolveAction(onToggle),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    toggle: ToggleNode;
  }
}
