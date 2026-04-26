/**
 * Layer-2 tokens for Switch (track) and the matching switch-thumb tokens.
 *
 * The thumb is its own conceptual token namespace (`--switch-thumb-*`)
 * but it ships with the Switch component, so the tokens live together.
 */

import { registerTokens } from '../../tokens/component-registry';
import {
  meta as buildMeta,
  controlSurfaceTokens,
  defineComponentTokens,
} from '../../tokens/expand';
import { meta } from './meta';

const track = buildMeta(meta.name);
const thumb = buildMeta('switch-thumb', 'switchThumb');

registerTokens([
  ...defineComponentTokens(track, {
    radius: {
      default: '9999px',
      description: 'Switch track corner radius. Default is fully rounded.',
      alias: 'switch',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Switch track corner geometry.',
    },
    'track-width': {
      default: '2.5rem',
      description: 'Switch track width. Fits two thumb diameters + padding + border.',
    },
    'track-height': {
      default: '1.5rem',
      description: 'Switch track height. Leaves room for thumb + padding + border.',
    },
  }),
  ...controlSurfaceTokens(track, {}, {}, '0px'),

  ...defineComponentTokens(thumb, {
    radius: {
      default: '9999px',
      description: 'Switch thumb corner radius.',
      alias: 'switch-thumb',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Switch thumb corner geometry.',
    },
    size: { default: '1rem', description: 'Switch thumb diameter at the default size.' },
  }),
]);
