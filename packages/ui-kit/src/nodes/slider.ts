import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface SliderNode extends BaseNode {
  type: 'slider';
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: string;
  icon?: string;
  color?: ColorValue;
  /** Disable the slider */
  disabled?: boolean;
}

export function Slider(props: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: ActionHandler;
  icon?: string;
  color?: ColorValue;
  disabled?: boolean;
}): SliderNode {
  const { onChange, ...rest } = props;
  return {
    type: 'slider',
    ...rest,
    onChange: resolveAction(onChange),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    slider: SliderNode;
  }
}
