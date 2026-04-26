/**
 * Layer-2 tokens for the dropdown menu surface and its items.
 *
 * Note: this folder is named `dropdown-menu` (matches the React component
 * and Radix's `DropdownMenu` namespace), but the CSS tokens use the
 * shorter `--menu-*` and `--menu-item-*` prefixes — so they're declared
 * with hardcoded names rather than `meta.name`.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  controlSurfaceTokens,
  defineComponentTokens,
  geometryTokens,
  motionTokens,
} from '../../tokens/expand';
import { SPACING_1, SPACING_1_5, SPACING_2 } from '../../tokens/spacing';

const menu = buildMeta('menu');
const menuItem = buildMeta('menu-item', 'menuItem');

registerTokens([
  ...defineComponentTokens(menu, {
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
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Menu surface corner geometry.',
    },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent dropdown menu.',
    },
  }),
  ...borderTokens(menu, '1px'),
  ...motionTokens(menu),
  ...geometryTokens(menu, { paddingX: SPACING_1, paddingY: SPACING_1, gap: '0.125rem' }),

  ...defineComponentTokens(menuItem, {
    radius: {
      default: 'var(--radius-control)',
      description: 'Menu-item corner radius.',
      alias: 'menu-item',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Menu-item corner geometry.',
    },
  }),
  ...controlSurfaceTokens(
    menuItem,
    { paddingX: SPACING_2, paddingY: SPACING_1_5, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' }
  ),
]);
