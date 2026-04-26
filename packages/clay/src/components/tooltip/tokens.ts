/**
 * Layer-2 tokens for Tooltip.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  geometryTokens,
  motionTokens,
  typographyTokens,
} from '../../tokens/expand';
import { SPACING_1, SPACING_2 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-control)',
      description: 'Tooltip corner radius.',
      alias: 'tooltip',
    },
    shadow: {
      default: 'var(--shadow-overlay)',
      description: 'Tooltip elevation.',
      alias: 'tooltip',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Tooltip corner geometry.',
    },
  }),
  ...borderTokens(m),
  ...motionTokens(m),
  ...typographyTokens(m, { fontSize: 'var(--text-label-md)', fontWeight: '500' }),
  ...geometryTokens(m, { paddingX: SPACING_2, paddingY: SPACING_1 }),
]);
