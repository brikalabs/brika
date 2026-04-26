/**
 * Layer-2 tokens for Input.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  meta as buildMeta,
  controlSurfaceTokens,
  defineComponentTokens,
} from '../../tokens/expand';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-control)',
      description: 'Input corner radius.',
      alias: 'input',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Input corner geometry.',
    },
    container: { default: 'var(--background)', description: 'Input background.' },
    label: { default: 'var(--foreground)', description: 'Input text color.' },
    border: { default: 'var(--input)', description: 'Input border color.' },
    placeholder: {
      default: 'var(--muted-foreground)',
      description: 'Input placeholder text color.',
    },
  }),
  ...controlSurfaceTokens(
    m,
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),
]);
