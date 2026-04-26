/**
 * Layer 0 — Scalars
 * One knob per concern. Themes set these; everything downstream cascades.
 *
 * Each entry omits `layer` (always `'scalar'`) — the `scalar` builder
 * stamps it back in. Keeps the table compact and removes the structural
 * boilerplate Sonar flagged as duplication.
 */

import type { TokenSpec } from './types';

type ScalarSpec = Omit<TokenSpec, 'layer'>;

function scalar(spec: ScalarSpec): TokenSpec {
  return { ...spec, layer: 'scalar' };
}

export const SCALARS: readonly TokenSpec[] = [
  scalar({
    name: 'radius',
    category: 'geometry',
    defaultLight: '0.75rem',
    description: 'Base corner radius. Drives the entire semantic radius scale.',
    themePath: 'geometry.radius',
  }),
  scalar({
    name: 'spacing',
    category: 'geometry',
    defaultLight: '0.25rem',
    description: 'Base spacing step. Drives Tailwind p-/m-/gap-/size-* utilities.',
    themePath: 'geometry.spacing',
  }),
  scalar({
    name: 'text-base',
    category: 'typography',
    defaultLight: '1rem',
    description: 'Reference font size. Rescales the entire typography scale.',
    themePath: 'geometry.textBase',
  }),
  scalar({
    name: 'font-sans',
    category: 'typography',
    defaultLight: '"Inter", ui-sans-serif, system-ui, sans-serif',
    description: 'Default UI typeface for body and controls.',
    themePath: 'geometry.fontSans',
    tailwindNamespace: 'font',
    utilityAlias: 'sans',
  }),
  scalar({
    name: 'font-mono',
    category: 'typography',
    defaultLight: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    description: 'Monospace typeface for code and tabular content.',
    themePath: 'geometry.fontMono',
    tailwindNamespace: 'font',
    utilityAlias: 'mono',
  }),
  scalar({
    name: 'border-width',
    category: 'border',
    defaultLight: '1px',
    description: 'Default border width. Honored by the bare `border` utility.',
    themePath: 'borders.width',
    tailwindNamespace: 'default',
    utilityAlias: 'border-width',
  }),
  scalar({
    name: 'ring-width',
    category: 'focus',
    defaultLight: '2px',
    description: 'Default focus ring width. Used by the `ring-themed` utility.',
    themePath: 'focus.width',
  }),
  scalar({
    name: 'ring-offset',
    category: 'focus',
    defaultLight: '2px',
    description: 'Default focus ring offset. Used by `ring-themed`.',
    themePath: 'focus.offset',
  }),
  scalar({
    name: 'motion-duration',
    category: 'motion',
    defaultLight: '220ms',
    description: 'Base transition duration. Derived motion channels scale from this.',
    themePath: 'motion.duration',
  }),
  scalar({
    name: 'motion-easing',
    category: 'motion',
    defaultLight: 'cubic-bezier(0.16, 1, 0.3, 1)',
    description: 'Base transition easing. Used by the `ease-standard` utility.',
    themePath: 'motion.easing',
  }),
  scalar({
    name: 'backdrop-blur',
    category: 'elevation',
    defaultLight: '8px',
    description: 'Default backdrop blur. Honored by `backdrop-blur-theme`.',
    themePath: 'geometry.backdropBlur',
    tailwindNamespace: 'blur',
    utilityAlias: 'theme',
  }),
  scalar({
    name: 'glass-tint',
    category: 'color',
    defaultLight: 'transparent',
    description: 'Tint colour layered above blurred surfaces. Use rgba/oklch with alpha.',
    themePath: 'glass.tint',
  }),
];
