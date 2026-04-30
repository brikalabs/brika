import { defineComponent } from '../../tokens/define';
import { SPACING_4 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  border: '1px',
  geometry: { paddingY: SPACING_4, gap: SPACING_4 },
  slots: {
    border: { default: 'var(--border)', description: 'Section divider border color.' },
    title: { default: 'var(--foreground)', description: 'Section title color.' },
    description: { default: 'var(--muted-foreground)', description: 'Section description color.' },
  },
});
