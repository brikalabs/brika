import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Outer corner radius of the group.',
    alias: 'button-group',
  },
  border: '1px',
  shadow: {
    default: 'var(--shadow-surface)',
    description: 'Resting elevation of the group.',
    alias: 'button-group',
  },
});
