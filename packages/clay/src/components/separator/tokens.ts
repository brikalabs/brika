/**
 * Layer-2 tokens for Separator.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    color: { default: 'var(--border)', description: 'Separator line color.' },
    width: { default: '1px', description: 'Separator line thickness.' },
    style: { default: 'solid', description: 'Separator line style (`solid`, `dashed`, `double`).' },
  }),
]);
