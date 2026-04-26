/**
 * Layer-2 tokens for Tabs.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  focusTokens,
  motionTokens,
  stateTokens,
  typographyTokens,
} from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: { default: 'var(--radius-control)', description: 'Tabs corner radius.', alias: 'tabs' },
    'corner-shape': { default: 'var(--corner-shape, round)', description: 'Tabs corner geometry.' },
    'trigger-padding-x': {
      default: 'calc(var(--spacing) * 3)',
      description: 'Inline padding inside a tab trigger.',
    },
    'trigger-padding-y': {
      default: 'calc(var(--spacing) * 1.5)',
      description: 'Block padding inside a tab trigger.',
    },
  }),
  ...borderTokens(m, '1px'),
  ...motionTokens(m),
  ...focusTokens(m),
  ...stateTokens(m),
  ...typographyTokens(m, { fontSize: 'var(--text-label-lg)', fontWeight: '500' }),
]);
