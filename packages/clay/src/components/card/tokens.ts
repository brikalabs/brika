/**
 * Layer-2 tokens for Card.
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
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-container)',
      description: 'Card corner radius.',
      alias: 'card',
    },
    shadow: { default: 'var(--shadow-raised)', description: 'Card elevation.', alias: 'card' },
    'corner-shape': { default: 'var(--corner-shape, round)', description: 'Card corner geometry.' },
    container: { default: 'var(--card)', description: 'Card background.' },
    label: { default: 'var(--card-foreground)', description: 'Card text color.' },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent card. Set non-zero for glass.',
    },
  }),
  ...borderTokens(m, '1px'),
  ...motionTokens(m),
  ...typographyTokens(m, { fontSize: 'var(--text-body-md)' }),
  ...geometryTokens(m, { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),
]);
