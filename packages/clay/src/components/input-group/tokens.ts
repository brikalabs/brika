import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Input group outer corner radius.',
    alias: 'input-group',
  },
  border: '1px',
  slots: {
    'addon-bg': { default: 'var(--muted)', description: 'Addon background.' },
    'addon-foreground': {
      default: 'var(--muted-foreground)',
      description: 'Addon text/icon color.',
    },
    'addon-border': { default: 'var(--border)', description: 'Divider between addon and input.' },
  },
});
