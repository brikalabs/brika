import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-control)', description: 'Progress display panel corner radius.', alias: 'progress-display' },
  border: '1px',
  slots: {
    'log-bg':         { default: 'var(--muted)', description: 'Log output area background.' },
    'log-foreground': { default: 'var(--muted-foreground)', description: 'Log output text color.' },
    'bar-color':      { default: 'var(--primary)', description: 'Progress bar fill color.' },
  },
});
