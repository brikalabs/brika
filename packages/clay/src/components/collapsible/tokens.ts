import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-control)', description: 'Collapsible container corner radius.', alias: 'collapsible' },
  border: '1px',
  motion: true,
  slots: {
    container: { default: 'var(--card)', description: 'Collapsible surface background.' },
    label:     { default: 'var(--card-foreground)', description: 'Collapsible text color.' },
  },
});
