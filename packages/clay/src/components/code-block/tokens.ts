/**
 * Layer-2 tokens for CodeBlock.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    bg: { default: 'var(--muted)', description: 'Code block background.' },
    radius: {
      default: 'var(--radius-control)',
      description: 'Code block corner radius.',
      alias: 'code-block',
    },
  }),
]);
