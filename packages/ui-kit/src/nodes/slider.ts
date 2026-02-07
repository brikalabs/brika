import type { BaseNode } from './_shared';

export interface SliderNode extends BaseNode {
  type: 'slider';
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: string;
  icon?: string;
  color?: string;
}

export function Slider(props: Omit<SliderNode, 'type'>): SliderNode {
  return { type: 'slider', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    slider: SliderNode;
  }
}
