/**
 * Layer-2 tokens for Table.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    'header-bg': { default: 'var(--muted)', description: 'Background for table header rows.' },
    'row-bg': { default: 'var(--background)', description: 'Background for table body rows.' },
    'row-hover-bg': { default: 'var(--accent)', description: 'Background for hovered table rows.' },
  }),
]);
