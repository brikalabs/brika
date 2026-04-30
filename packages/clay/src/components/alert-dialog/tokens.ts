import { defineComponent } from '../../tokens/define';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-surface)', description: 'Alert dialog corner radius.', alias: 'alert-dialog' },
  shadow: { default: 'var(--shadow-modal)', description: 'Alert dialog elevation.', alias: 'alert-dialog' },
  border: '1px',
  motion: true,
  backdropBlur: { default: '0px', description: 'Backdrop blur behind a translucent alert dialog.' },
  geometry: { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
  slots: {
    container: { default: 'var(--popover)', description: 'Alert dialog background.' },
    label:     { default: 'var(--popover-foreground)', description: 'Alert dialog text color.' },
  },
});
