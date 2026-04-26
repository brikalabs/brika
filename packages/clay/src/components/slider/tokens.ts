/**
 * Layer-2 tokens for Slider.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    'track-height': { default: '0.25rem', description: 'Slider track thickness.' },
    'thumb-size': { default: '1rem', description: 'Slider thumb diameter.' },
    radius: {
      default: '9999px',
      description: 'Track corner radius. Set lower for square / brutalist looks.',
      alias: 'slider',
    },
    'thumb-radius': {
      default: '9999px',
      description: 'Thumb corner radius. Lower for square thumbs.',
      alias: 'slider-thumb',
    },
    'tick-size': { default: '0.25rem', description: 'Tick dot diameter on the track.' },
    'thumb-border-width': {
      default: '2px',
      description: 'Thumb border width — the contrast halo between the thumb and the track.',
    },
    'thumb-shadow': {
      default: 'var(--shadow-raised)',
      description: 'Thumb drop shadow. Falls back to the global `--shadow-raised`.',
      alias: 'slider-thumb',
    },
    track: { default: 'var(--muted)', description: 'Unfilled portion of the track.' },
    fill: {
      default: 'var(--primary)',
      description: 'Filled portion of the track (left of the thumb).',
    },
    thumb: { default: 'var(--primary)', description: 'Thumb fill color.' },
    'thumb-border': {
      default: 'var(--background)',
      description: 'Thumb border (the halo separating thumb from track).',
    },
    tick: {
      default: 'var(--foreground)',
      description: 'Inactive tick dot color (over the unfilled track). Used with reduced opacity.',
    },
    'tick-active': {
      default: 'var(--primary-foreground)',
      description: 'Active tick dot color (over the filled track). Used with reduced opacity.',
    },
    label: { default: 'var(--muted-foreground)', description: 'Tick label text color.' },
    'label-active': {
      default: 'var(--foreground)',
      description: 'Tick label color when its value matches the current slider value.',
    },
  }),
]);
