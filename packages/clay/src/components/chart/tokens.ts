import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  slots: {
    color:        { default: 'var(--primary)', description: 'Chart line and gradient color.' },
    'grid-color': { default: 'var(--border)', description: 'Axis and grid line color.' },
    'tick-color': { default: 'var(--muted-foreground)', description: 'Axis tick label color.' },
  },
});
