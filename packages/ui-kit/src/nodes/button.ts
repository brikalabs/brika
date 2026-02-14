import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface ButtonNode extends BaseNode {
  type: 'button';
  label?: string;
  onPress?: string;
  /** When set, clicking opens this URL in a new tab instead of dispatching an action. */
  url?: string;
  icon?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  color?: ColorValue;
  /** Disable the button */
  disabled?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to full width */
  fullWidth?: boolean;
}

export function Button(props: {
  label?: string;
  onPress?: ActionHandler;
  url?: string;
  icon?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  color?: ColorValue;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}): ButtonNode {
  const { onPress, ...rest } = props;
  return { type: 'button', ...rest, onPress: onPress ? resolveAction(onPress) : undefined };
}

declare module './_shared' {
  interface NodeTypeMap {
    button: ButtonNode;
  }
}
