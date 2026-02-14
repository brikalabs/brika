/**
 * @brika/ui-kit
 *
 * Descriptor types + component functions for plugin UI bricks.
 * Zero React, zero DOM — consumed by both SDK (plugin-side) and UI app.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Node Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Shared
  ActionHandler,
  AvatarNode,
  BadgeNode,
  BaseNode,
  BoxNode,
  // Input
  ButtonNode,
  // Feedback
  CalloutNode,
  ChartDataPoint,
  ChartNode,
  ChartSeries,
  CheckboxNode,
  CodeBlockNode,
  ColumnNode,
  ComponentNode,
  DividerNode,
  FlexLayoutProps,
  GridNode,
  IconNode,
  ImageNode,
  KeyValueItem,
  KeyValueNode,
  LinkNode,
  NodeTypeMap,
  ProgressNode,
  // Layout
  RowNode,
  SectionNode,
  SelectNode,
  SelectOption,
  SkeletonNode,
  SliderNode,
  SpacerNode,
  StatusNode,
  StatValueNode,
  TabItem,
  TableColumn,
  TableNode,
  TabsNode,
  TextInputNode,
  // Data display
  TextNode,
  ToggleNode,
  VideoNode,
} from './nodes';

// ─────────────────────────────────────────────────────────────────────────────
// Component Builders (PascalCase — used with custom jsx-runtime)
// ─────────────────────────────────────────────────────────────────────────────

export {
  Avatar,
  Badge,
  Box,
  // Input
  Button,
  // Feedback
  Callout,
  Chart,
  Checkbox,
  CodeBlock,
  Column,
  Divider,
  Grid,
  Icon,
  Image,
  KeyValue,
  Link,
  Progress,
  // Layout
  Row,
  Section,
  Select,
  Skeleton,
  Slider,
  Spacer,
  Stat,
  Status,
  Table,
  Tabs,
  // Data display
  Text,
  TextInput,
  Toggle,
  Video,
} from './nodes';

// ─────────────────────────────────────────────────────────────────────────────
// Descriptors
// ─────────────────────────────────────────────────────────────────────────────

export type { ActionNode, BrickDescriptor, Mutation } from './descriptors';
export { MUT } from './descriptors';

// ─────────────────────────────────────────────────────────────────────────────
// defineBrick
// ─────────────────────────────────────────────────────────────────────────────

export type {
  BrickActionHandler,
  BrickComponent,
  BrickFamily,
  BrickInstanceContext,
  BrickTypeSpec,
  CompiledBrickType,
} from './define-brick';

export { defineBrick } from './define-brick';

// ─────────────────────────────────────────────────────────────────────────────
// Mutation Applicator (shared between Hub and UI)
// ─────────────────────────────────────────────────────────────────────────────

export { applyMutations } from './mutations';

// ─────────────────────────────────────────────────────────────────────────────
// Theme-aware color tokens
// ─────────────────────────────────────────────────────────────────────────────

export type { BackgroundToken, BackgroundValue, ColorToken, ColorValue } from './colors';
export { colors } from './colors';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-action registration (internal — used by SDK render pipeline)
// ─────────────────────────────────────────────────────────────────────────────

export { _setActionRegistrar } from './nodes';
