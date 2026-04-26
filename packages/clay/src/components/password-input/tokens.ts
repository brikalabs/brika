/**
 * Layer-2 tokens for PasswordInput.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, controlSurfaceTokens } from '../../tokens/expand';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

const m = buildMeta(meta.name, 'passwordInput');

registerTokens([
  ...controlSurfaceTokens(
    m,
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),
]);
