/**
 * Pure math for computing resize dimensions.
 * No WASM imports — easy to test and reason about.
 */

import type { ResizeFit, ResizeOp } from './types';

/** Compute the resize (and optional crop) for a given fit mode. Returns null if no-op. */
export function computeResize(
  srcW: number,
  srcH: number,
  targetW: number | undefined,
  targetH: number | undefined,
  fit: ResizeFit,
): ResizeOp | null {
  if (!targetW && !targetH) return null;

  switch (fit) {
    case 'cover':
      return cover(srcW, srcH, targetW ?? srcW, targetH ?? srcH);
    case 'contain':
      return contain(srcW, srcH, targetW, targetH);
    case 'fill':
      return { width: targetW ?? srcW, height: targetH ?? srcH };
  }
}

/** Scale to fill the box, then center-crop to exact dimensions. */
function cover(srcW: number, srcH: number, tw: number, th: number): ResizeOp {
  const scale = Math.max(tw / srcW, th / srcH);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  return {
    width: w,
    height: h,
    crop: {
      x: Math.round((w - tw) / 2),
      y: Math.round((h - th) / 2),
      w: tw,
      h: th,
    },
  };
}

/** Scale to fit within the box, preserving aspect ratio. */
function contain(
  srcW: number,
  srcH: number,
  targetW: number | undefined,
  targetH: number | undefined,
): ResizeOp | null {
  if (targetW && targetH) {
    const scale = Math.min(targetW / srcW, targetH / srcH);
    return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
  }
  if (targetW) {
    return { width: targetW, height: Math.round(srcH * (targetW / srcW)) };
  }
  if (targetH) {
    return { width: Math.round(srcW * (targetH / srcH)), height: targetH };
  }
  return null;
}
