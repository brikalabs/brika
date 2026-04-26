/**
 * Layer-2 tokens for Dialog.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  focusTokens,
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
      description: 'Dialog corner radius.',
      alias: 'dialog',
    },
    shadow: { default: 'var(--shadow-modal)', description: 'Dialog elevation.', alias: 'dialog' },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Dialog corner geometry.',
    },
    container: { default: 'var(--popover)', description: 'Dialog background.' },
    label: { default: 'var(--popover-foreground)', description: 'Dialog text color.' },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent dialog.',
    },
  }),
  ...borderTokens(m, '1px'),
  ...focusTokens(m),
  ...motionTokens(m),
  ...geometryTokens(m, { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),
]);
