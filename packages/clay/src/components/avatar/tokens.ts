/**
 * Layer-2 tokens for Avatar.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: '9999px',
    description: 'Avatar corner radius. Default is fully circular.',
    alias: 'avatar',
  },
  slots: {
    size: { default: '2rem', description: 'Avatar diameter at the default size.' },
  },
});
