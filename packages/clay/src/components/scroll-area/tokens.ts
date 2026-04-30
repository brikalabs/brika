import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  slots: {
    'scrollbar-color': { default: 'var(--border)', description: 'Scrollbar thumb color.' },
    'scrollbar-hover-color': {
      default: 'var(--muted-foreground)',
      description: 'Scrollbar thumb color on hover.',
    },
    'scrollbar-size': { default: '6px', description: 'Scrollbar thumb width/height.' },
  },
});
