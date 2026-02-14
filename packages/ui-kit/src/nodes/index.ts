// Shared types — ComponentNode and NodeTypeMap are auto-derived via declaration merging
export type {
  ActionHandler,
  BaseNode,
  ComponentNode,
  FlexLayoutProps,
  NodeTypeMap,
} from './_shared';
export { _setActionRegistrar, type Child, normalizeChildren, resolveAction } from './_shared';
export { Avatar, type AvatarNode } from './avatar';
export { Badge, type BadgeNode } from './badge';
export { Box, type BoxNode } from './box';
export { Button, type ButtonNode } from './button';
export { Callout, type CalloutNode } from './callout';
export { Chart, type ChartDataPoint, type ChartNode, type ChartSeries } from './chart';
export { Checkbox, type CheckboxNode } from './checkbox';
export { CodeBlock, type CodeBlockNode } from './code-block';
export { Column, type ColumnNode } from './column';
export { Divider, type DividerNode } from './divider';
export { Grid, type GridNode } from './grid';
export { Icon, type IconNode } from './icon';
export { Image, type ImageNode } from './image';
export { KeyValue, type KeyValueItem, type KeyValueNode } from './key-value';
export { Link, type LinkNode } from './link';
export { Progress, type ProgressNode } from './progress';
// Node types + components (each file self-registers into NodeTypeMap)
export { Row, type RowNode } from './row';
export { Section, type SectionNode } from './section';
export { Select, type SelectNode, type SelectOption } from './select';
export { Skeleton, type SkeletonNode } from './skeleton';
export { Slider, type SliderNode } from './slider';
export { Spacer, type SpacerNode } from './spacer';
export { Stat, type StatValueNode } from './stat-value';
export { Status, type StatusNode } from './status';
export { Table, type TableColumn, type TableNode } from './table';
export { type TabItem, Tabs, type TabsNode } from './tabs';
export { Text, type TextNode } from './text';
export { TextInput, type TextInputNode } from './text-input';
export { Toggle, type ToggleNode } from './toggle';
export { Video, type VideoNode } from './video';
