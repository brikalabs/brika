/**
 * Layer-2 tokens for PasswordInput.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  themeKey: 'passwordInput',
  surface: { borderWidth: '1px' },
  geometry: { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2 },
  typography: { fontSize: 'var(--text-body-md)' },
});
