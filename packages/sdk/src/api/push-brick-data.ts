/** Push data to all client-rendered instances of a brick type. */

import { getContext } from '../context';

/**
 * Push data to all client-rendered instances of a brick type. Prefer
 * {@link defineBrick}'s typed `descriptor.data.set()`, which is built on this and
 * validates the payload against the brick's zod `data` schema first.
 */
export function setBrickData(brickTypeId: string, data: unknown): void {
  getContext().setBrickData(brickTypeId, data);
}
