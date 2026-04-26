/**
 * Layer 1 — State roles
 * Overlay opacities for hover / focus / pressed / selected / disabled.
 */

import type { TokenSpec } from '../types';

type StateEntry = readonly [name: string, defaultLight: string, description: string];

function toStateRole([name, defaultLight, description]: StateEntry): TokenSpec {
  // `state-hover-opacity` → themePath `state.hoverOpacity`, alias `state-hover`.
  const trimmed = name.replace(/^state-/, '').replace(/-opacity$/, '');
  const themeKey = `${trimmed.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase())}Opacity`;
  return {
    name,
    layer: 'role',
    category: 'state',
    defaultLight,
    description,
    themePath: `state.${themeKey}`,
    tailwindNamespace: 'opacity',
    utilityAlias: `state-${trimmed}`,
  };
}

const STATE_DEFS: readonly StateEntry[] = [
  ['state-hover-opacity', '0.08', 'Overlay opacity for hover state layers.'],
  ['state-focus-opacity', '0.12', 'Overlay opacity for focus state layers.'],
  ['state-pressed-opacity', '0.16', 'Overlay opacity for pressed state layers.'],
  ['state-selected-opacity', '0.12', 'Overlay opacity for selected state layers.'],
  ['state-disabled-opacity', '0.38', 'Opacity applied to disabled controls.'],
];

export const STATE_ROLES: readonly TokenSpec[] = STATE_DEFS.map(toStateRole);
