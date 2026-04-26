/**
 * Layer-2 tokens for Popover.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  geometryTokens,
  motionTokens,
} from '../../tokens/expand';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Popover corner radius.',
      alias: 'popover',
    },
    shadow: {
      default: 'var(--shadow-overlay)',
      description: 'Popover elevation.',
      alias: 'popover',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Popover corner geometry.',
    },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent popover.',
    },
  }),
  ...borderTokens(m, '1px'),
  ...motionTokens(m),
  ...geometryTokens(m, { paddingX: SPACING_3, paddingY: SPACING_3, gap: SPACING_2 }),
]);
