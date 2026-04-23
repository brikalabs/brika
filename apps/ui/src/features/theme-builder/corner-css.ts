/**
 * Corner-style CSS helpers.
 *
 * The CSS `corner-shape` property is still making its way across browsers,
 * so the theme builder emits two things whenever a non-default corner is
 * selected:
 *
 *   • A `corner-shape` declaration on the themed scope (native where it
 *     ships; ignored elsewhere).
 *   • A `--corner-clip-path` CSS custom property that downstream components
 *     can opt into via `clip-path: var(--corner-clip-path)` to approximate
 *     the shape in current browsers. For the default `round` style we
 *     leave this unset so plain `border-radius` continues to work.
 */

import type { CornerStyle } from './types';

/** Map our corner-style id to the CSS `corner-shape` keyword. */
export function cornerShapeKeyword(style: CornerStyle | undefined): string {
  switch (style) {
    case 'squircle':
      return 'squircle';
    case 'bevel':
      return 'bevel';
    case 'scoop':
      return 'scoop';
    case 'notch':
      return 'notch';
    default:
      return 'round';
  }
}

/**
 * Return a `clip-path` value that approximates the given corner style.
 * Uses `radius` (in rem) to scale; returns null for plain round corners
 * where plain `border-radius` already does the job.
 */
export function cornerClipPath(style: CornerStyle | undefined, radius: number): string | null {
  if (!style || style === 'round') {
    return null;
  }
  const r = `${Math.max(radius, 0)}rem`;

  if (style === 'bevel') {
    return `polygon(
      ${r} 0,
      calc(100% - ${r}) 0,
      100% ${r},
      100% calc(100% - ${r}),
      calc(100% - ${r}) 100%,
      ${r} 100%,
      0 calc(100% - ${r}),
      0 ${r}
    )`;
  }

  if (style === 'notch') {
    return `polygon(
      ${r} 0,
      100% 0,
      100% calc(100% - ${r}),
      calc(100% - ${r}) calc(100% - ${r}),
      calc(100% - ${r}) 100%,
      0 100%,
      0 ${r},
      ${r} ${r}
    )`;
  }

  // squircle + scoop don't map cleanly to a polygon clip-path; leave to
  // native `corner-shape`. Using `none` keeps older browsers on plain
  // border-radius instead of awkwardly chopped corners.
  return 'none';
}
