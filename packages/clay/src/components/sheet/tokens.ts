/**
 * Layer-2 tokens for Sheet.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  geometryTokens,
  motionTokens,
} from '../../tokens/expand';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Sheet corner radius.',
      alias: 'sheet',
    },
    shadow: { default: 'var(--shadow-modal)', description: 'Sheet elevation.', alias: 'sheet' },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent sheet.',
    },
  }),
  ...borderTokens(m, '1px'),
  ...motionTokens(m),
  ...geometryTokens(m, { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),
]);
