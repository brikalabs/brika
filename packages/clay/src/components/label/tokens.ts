import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  typography: { fontSize: 'var(--text-label-md)', fontWeight: '500', letterSpacing: '0em' },
  slots: {
    color: { default: 'var(--foreground)', description: 'Label text color.' },
  },
});
