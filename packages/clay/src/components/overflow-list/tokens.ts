import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  slots: {
    'overflow-bg':         { default: 'var(--muted)', description: 'Overflow indicator background.' },
    'overflow-foreground': { default: 'var(--muted-foreground)', description: 'Overflow indicator text color.' },
  },
});
