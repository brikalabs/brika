/**
 * Color conversion helpers for Matter light controls.
 *
 * Used to compute CSS hex colors from Matter device state values
 * (HSV color space and mireds color temperature).
 */

/** Convert HSV (h 0-360, s 0-100, v 0-100) to CSS hex color */
export function hsvToHex(h: number, s: number, v: number): string {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert color temperature in mireds to approximate CSS hex color */
export function miredsToHex(mireds: number): string {
  const kelvin = Math.round(1_000_000 / Math.max(mireds, 100));
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.47 * Math.log(t) - 161.12));
    b = t <= 19 ? 0 : Math.min(255, Math.max(0, 138.52 * Math.log(t - 10) - 305.04));
  } else {
    r = Math.min(255, Math.max(0, 329.7 * (t - 60) ** -0.1332));
    g = Math.min(255, Math.max(0, 288.12 * (t - 60) ** -0.0755));
    b = 255;
  }
  const toHex = (n: number) =>
    Math.round(n)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
