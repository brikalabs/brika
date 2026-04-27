/**
 * Layer-2 tokens for Button.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_4 } from '../../tokens/spacing';
import { meta } from './meta';

defineComponent(meta.name, {
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
  surface: true,
  geometry: { height: '2.25rem', paddingX: SPACING_4, paddingY: SPACING_2, gap: SPACING_2 },
  typography: { fontWeight: '500', fontSize: 'var(--text-body-md)' },
  slots: {
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
  },
});
