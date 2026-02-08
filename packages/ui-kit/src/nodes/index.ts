// Shared types — ComponentNode and NodeTypeMap are auto-derived via declaration merging
export type { ActionHandler, BaseNode, ComponentNode, NodeTypeMap } from './_shared';
export { normalizeChildren, resolveAction, _setActionRegistrar, type Child } from './_shared';

// Node types + components (each file self-registers into NodeTypeMap)
export { type StatValueNode, Stat } from './stat-value';
export { type ToggleNode, Toggle } from './toggle';
export { type SliderNode, Slider } from './slider';
export { type ChartNode, type ChartDataPoint, Chart } from './chart';
export { type StatusNode, Status } from './status';
export { type TextNode, Text } from './text';
export { type ImageNode, Image } from './image';
export { type VideoNode, Video } from './video';
export { type ButtonNode, Button } from './button';
export { type GridNode, Grid } from './grid';
export { type StackNode, Stack } from './stack';
export { type SectionNode, Section } from './section';
export { type BoxNode, Box } from './box';
export { type SpacerNode, Spacer } from './spacer';
export { type DividerNode, Divider } from './divider';
export { type ProgressNode, Progress } from './progress';
export { type BadgeNode, Badge } from './badge';
export { type IconNode, Icon } from './icon';
