import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-control)', description: 'Skeleton block corner radius.', alias: 'skeleton' },
  slots: {
    color:     { default: 'var(--accent)', description: 'Skeleton base color.' },
    highlight: { default: 'var(--muted)', description: 'Skeleton shimmer highlight color.' },
  },
});
