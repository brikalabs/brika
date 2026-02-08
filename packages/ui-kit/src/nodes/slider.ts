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
  color?: string;
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
  color?: string;
}): SliderNode {
  const { onChange, ...rest } = props;
  return { type: 'slider', ...rest, onChange: resolveAction(onChange) };
}

declare module './_shared' {
  interface NodeTypeMap {
    slider: SliderNode;
  }
}
