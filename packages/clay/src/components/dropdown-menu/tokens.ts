/**
 * Layer-2 tokens for DropdownMenu (the surface) and DropdownMenuItem
 * (each row inside).
 *
 * Token names use the shorter `--menu-*` / `--menu-item-*` prefix so the
 * Select component can reuse the same tokens for its own dropdown surface.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_1, SPACING_1_5, SPACING_2 } from '../../tokens/spacing';

defineComponent('menu', {
  radius: {
    default: 'var(--radius-surface)',
    description: 'Menu surface corner radius.',
    alias: 'menu',
  },
  shadow: {
    default: 'var(--shadow-overlay)',
    description: 'Menu surface elevation.',
    alias: 'menu',
  },
  border: '1px',
  motion: true,
  backdropBlur: {
    default: '0px',
    description: 'Backdrop blur applied behind a translucent dropdown menu.',
  },
  geometry: { paddingX: SPACING_1, paddingY: SPACING_1, gap: '0.125rem' },
});

defineComponent('menu-item', {
  themeKey: 'menuItem',
  radius: {
    default: 'var(--radius-control)',
    description: 'Menu-item corner radius.',
    alias: 'menu-item',
  },
  surface: true,
  geometry: { paddingX: SPACING_2, paddingY: SPACING_1_5, gap: SPACING_2 },
  typography: { fontSize: 'var(--text-body-md)' },
});
