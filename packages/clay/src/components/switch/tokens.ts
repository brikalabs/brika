/**
 * Layer-2 tokens for Switch (the track) and SwitchThumb (the dot inside).
 *
 * They live in the same file because the thumb is conceptually owned by
 * the switch even though it has its own token namespace.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: '9999px',
    description: 'Switch track corner radius. Default is fully rounded.',
    alias: 'switch',
  },
  surface: true,
  slots: {
    'track-width': {
      default: '2.5rem',
      description: 'Switch track width. Fits two thumb diameters + padding + border.',
    },
    'track-height': {
      default: '1.5rem',
      description: 'Switch track height. Leaves room for thumb + padding + border.',
    },
  },
});

defineComponent('switch-thumb', {
  themeKey: 'switchThumb',
  radius: {
    default: '9999px',
    description: 'Switch thumb corner radius.',
    alias: 'switch-thumb',
  },
  slots: {
    size: { default: '1rem', description: 'Switch thumb diameter at the default size.' },
  },
});
