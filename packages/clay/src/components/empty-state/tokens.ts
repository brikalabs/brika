import { defineComponent } from '../../tokens/define';
import { SPACING_4 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  geometry: { gap: SPACING_4 },
  slots: {
    'icon-color': { default: 'var(--muted-foreground)', description: 'Empty-state icon color.' },
    title:        { default: 'var(--foreground)', description: 'Empty-state title color.' },
    description:  { default: 'var(--muted-foreground)', description: 'Empty-state description color.' },
  },
});
