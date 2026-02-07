/**
 * @brika/sdk/bricks/components
 *
 * Built-in UI component factories for brick JSX.
 * Import core API (defineBrick, hooks) from '@brika/sdk/bricks/core'.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ButtonNode,
  ChartDataPoint,
  ImageNode,
  VideoNode,
} from '@brika/ui-kit';

// ─────────────────────────────────────────────────────────────────────────────
// Components (PascalCase — JSX and builder usage)
// ─────────────────────────────────────────────────────────────────────────────

export {
  Button,
  Chart,
  Grid,
  Image,
  Section,
  Slider,
  Stack,
  Stat,
  Status,
  Text,
  Toggle,
  Video,
} from '@brika/ui-kit';
