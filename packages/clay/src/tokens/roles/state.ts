/**
 * Layer 1 — State roles
 * Overlay opacities for hover / focus / pressed / selected / disabled.
 */

import type { TokenSpec } from '../types';

export const STATE_ROLES: readonly TokenSpec[] = [
  {
    name: 'state-hover-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.08',
    description: 'Overlay opacity for hover state layers.',
    themePath: 'state.hoverOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-hover',
  },
  {
    name: 'state-focus-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.12',
    description: 'Overlay opacity for focus state layers.',
    themePath: 'state.focusOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-focus',
  },
  {
    name: 'state-pressed-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.16',
    description: 'Overlay opacity for pressed state layers.',
    themePath: 'state.pressedOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-pressed',
  },
  {
    name: 'state-selected-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.12',
    description: 'Overlay opacity for selected state layers.',
    themePath: 'state.selectedOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-selected',
  },
  {
    name: 'state-disabled-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.38',
    description: 'Opacity applied to disabled controls.',
    themePath: 'state.disabledOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-disabled',
  },
];
