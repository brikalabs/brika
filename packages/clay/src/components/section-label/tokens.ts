import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  typography: {
    fontSize: 'var(--text-label-sm)',
    fontWeight: '500',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  slots: {
    color: { default: 'var(--muted-foreground)', description: 'Section label text color.' },
  },
});
