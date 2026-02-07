/**
 * @brika/ui-kit
 *
 * Descriptor types + component functions for plugin UI bricks.
 * Zero React, zero DOM — consumed by both SDK (plugin-side) and UI app.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Descriptor Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ActionNode,
  BaseNode,
  ButtonNode,
  BrickDescriptor,
  ChartDataPoint,
  ChartNode,
  ComponentNode,
  GridNode,
  ImageNode,
  Mutation,
  NodeTypeMap,
  SectionNode,
  SliderNode,
  StackNode,
  StatValueNode,
  StatusNode,
  TextNode,
  ToggleNode,
  VideoNode,
} from './descriptors';

// ─────────────────────────────────────────────────────────────────────────────
// Components (PascalCase — used with custom jsx-runtime and as builder functions)
// ─────────────────────────────────────────────────────────────────────────────

export { Button, Chart, Grid, Image, Section, Slider, Stack, Stat, Status, Text, Toggle, Video } from './components';

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
