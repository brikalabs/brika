import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_4 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  geometry: { paddingY: SPACING_4, gap: SPACING_2 },
  typography: { fontSize: 'var(--text-body-md)' },
  slots: {
    title: { default: 'var(--foreground)', description: 'Page header title color.' },
    description: {
      default: 'var(--muted-foreground)',
      description: 'Page header description color.',
    },
    border: { default: 'var(--border)', description: 'Optional bottom border color.' },
  },
});
