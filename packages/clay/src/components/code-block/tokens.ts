/**
 * Layer-2 tokens for CodeBlock.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Code block corner radius.',
    alias: 'code-block',
  },
  slots: {
    bg: { default: 'var(--muted)', description: 'Code block background.' },
  },
});
