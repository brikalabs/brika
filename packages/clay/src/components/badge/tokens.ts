/**
 * Layer-2 tokens for Badge.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  meta as buildMeta,
  controlSurfaceTokens,
  defineComponentTokens,
} from '../../tokens/expand';
import { SPACING_1, SPACING_2 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: { default: 'var(--radius-pill)', description: 'Badge corner radius.', alias: 'badge' },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Badge corner geometry.',
    },
  }),
  ...controlSurfaceTokens(
    m,
    { height: '1.5rem', paddingX: SPACING_2, paddingY: '0.125rem', gap: SPACING_1 },
    { fontSize: 'var(--text-label-md)' }
  ),
]);
