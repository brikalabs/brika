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
import { STATE_ROLES } from './state';

export { COLOR_ROLES } from './colors';
export { ELEVATION_ROLES } from './elevation';
export { GEOMETRY_ROLES } from './geometry';
export { MOTION_ROLES } from './motion';
export { STATE_ROLES } from './state';

export const ROLES: readonly TokenSpec[] = [
  COLOR_ROLES,
  GEOMETRY_ROLES,
  ELEVATION_ROLES,
  MOTION_ROLES,
  STATE_ROLES,
].flat();
