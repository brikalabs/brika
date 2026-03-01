import { getState } from './state';

/**
 * Returns the current grid size (width, height) of the brick instance.
 * Updates on every resize without unmounting the brick.
 */
export function useBrickSize(): {
  width: number;
  height: number;
} {
  return getState().brickSize;
}
