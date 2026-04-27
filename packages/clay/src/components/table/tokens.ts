/**
 * Layer-2 tokens for Table.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

defineComponent(meta.name, {
  slots: {
    'header-bg': { default: 'var(--muted)', description: 'Background for table header rows.' },
    'row-bg': { default: 'var(--background)', description: 'Background for table body rows.' },
    'row-hover-bg': { default: 'var(--accent)', description: 'Background for hovered table rows.' },
  },
});
