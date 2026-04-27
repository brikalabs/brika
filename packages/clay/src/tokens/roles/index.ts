/**
 * Layer 1 — Roles barrel.
 * Concatenates the per-category role arrays into a single `ROLES` list
 * consumed by `../registry.ts`.
 */

import type { TokenSpec } from '../types';
import { COLOR_ROLES } from './colors';
import { ELEVATION_ROLES } from './elevation';
import { GEOMETRY_ROLES } from './geometry';
import { MOTION_ROLES } from './motion';
import { RADIUS_SCALE_ROLES } from './radius-scale';
import { STATE_ROLES } from './state';
import { TYPOGRAPHY_SCALE_ROLES } from './typography-scale';

export { COLOR_ROLES } from './colors';
export { ELEVATION_ROLES } from './elevation';
export { GEOMETRY_ROLES } from './geometry';
export { MOTION_ROLES } from './motion';
export { RADIUS_SCALE_ROLES } from './radius-scale';
export { STATE_ROLES } from './state';
export { TYPOGRAPHY_SCALE_ROLES } from './typography-scale';

export const ROLES: readonly TokenSpec[] = [
  COLOR_ROLES,
  GEOMETRY_ROLES,
  RADIUS_SCALE_ROLES,
  ELEVATION_ROLES,
  MOTION_ROLES,
  STATE_ROLES,
  TYPOGRAPHY_SCALE_ROLES,
].flat();
