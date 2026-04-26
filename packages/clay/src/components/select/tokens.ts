/**
 * Layer-2 tokens for Select.
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
      description: 'Select trigger corner radius.',
      alias: 'select',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Select corner geometry.',
    },
  }),
  ...controlSurfaceTokens(
    m,
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),
]);
