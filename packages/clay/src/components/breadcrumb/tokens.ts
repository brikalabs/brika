import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  typography: { fontSize: 'var(--text-body-sm)', letterSpacing: '0em' },
  slots: {
    color: { default: 'var(--muted-foreground)', description: 'Breadcrumb item color.' },
    'active-color': {
      default: 'var(--foreground)',
      description: 'Active (current) breadcrumb color.',
    },
    separator: { default: 'var(--muted-foreground)', description: 'Separator glyph color.' },
  },
});
