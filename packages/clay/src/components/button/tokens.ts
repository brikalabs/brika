/**
 * Layer-2 tokens for Button.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  meta as buildMeta,
  controlSurfaceTokens,
  defineComponentTokens,
} from '../../tokens/expand';
import { SPACING_2, SPACING_4 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-control)',
      description: 'Button corner radius. Falls back to `radius-control`.',
      alias: 'button',
    },
    shadow: {
      default: 'var(--shadow-surface)',
      description: 'Resting elevation under a button.',
      alias: 'button',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Corner geometry (round / bevel / squircle / scoop / notch).',
    },
    'filled-container': {
      default: 'var(--primary)',
      description: 'Background of the filled button variant.',
    },
    'filled-label': {
      default: 'var(--primary-foreground)',
      description: 'Label color of the filled button variant.',
    },
    'outline-border': {
      default: 'var(--border)',
      description: 'Border color of the outline button variant.',
    },
    'outline-label': {
      default: 'var(--foreground)',
      description: 'Label color of the outline button variant.',
    },
  }),
  ...controlSurfaceTokens(
    m,
    { height: '2.25rem', paddingX: SPACING_4, paddingY: SPACING_2, gap: SPACING_2 },
    { fontWeight: '500', fontSize: 'var(--text-body-md)' }
  ),
]);
