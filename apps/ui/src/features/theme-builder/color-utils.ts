/**
 * Color utilities for the theme builder.
 * Parsing, conversion, luminance/contrast, and palette helpers.
 *
 * All helpers return `null` on unparseable input rather than throwing —
 * the builder accepts freeform CSS color strings and we don't want one
 * garbled token to crash the whole preview.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseHex(input: string): RGB | null {
  const v = input.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (!match) {
    return null;
  }
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);

  if (ss === 0) {
    const v = ll * 255;
    return { r: v, g: v, b: v };
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hk = hh / 360;

  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) {
      tt += 1;
    }
    if (tt > 1) {
      tt -= 1;
    }
    if (tt < 1 / 6) {
      return p + (q - p) * 6 * tt;
    }
    if (tt < 1 / 2) {
      return q;
    }
    if (tt < 2 / 3) {
      return p + (q - p) * (2 / 3 - tt) * 6;
    }
    return p;
  };

  return {
    r: hue2rgb(hk + 1 / 3) * 255,
    g: hue2rgb(hk) * 255,
    b: hue2rgb(hk - 1 / 3) * 255,
  };
}

/** Relative luminance per WCAG 2.1. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two colors, or null if either unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) {
    return null;
  }
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type WcagGrade = 'AAA' | 'AA' | 'AA-large' | 'fail';

export function gradeContrast(ratio: number): WcagGrade {
  if (ratio >= 7) {
    return 'AAA';
  }
  if (ratio >= 4.5) {
    return 'AA';
  }
  if (ratio >= 3) {
    return 'AA-large';
  }
  return 'fail';
}

/** Lighten or darken a hex color by `amount` (−1…1) in HSL lightness. */
export function shiftLightness(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) {
    return hex;
  }
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, l: clamp(hsl.l + amount, 0, 1) }));
}

/** Mix two hex colors in RGB space. `t` = 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) {
    return a;
  }
  const tt = clamp(t, 0, 1);
  return rgbToHex({
    r: ra.r + (rb.r - ra.r) * tt,
    g: ra.g + (rb.g - ra.g) * tt,
    b: ra.b + (rb.b - ra.b) * tt,
  });
}

/** Pick the higher-contrast option between two foreground candidates. */
export function bestForeground(bg: string, options: readonly string[] = ['#ffffff', '#0b0c10']) {
  let best = options[0];
  let bestRatio = 0;
  for (const candidate of options) {
    const r = contrastRatio(bg, candidate) ?? 0;
    if (r > bestRatio) {
      bestRatio = r;
      best = candidate;
    }
  }
  return best;
}

/** Invert lightness (approximately) to synthesize a dark-mode palette. */
export function invertLightness(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) {
    return hex;
  }
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, l: 1 - hsl.l }));
}
