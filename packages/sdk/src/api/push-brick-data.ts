/**
 * Push data to all client-rendered instances of a brick type.
 * Data becomes available in the browser via useBrickData<T>().
 */

import { getContext } from '../context';

export function setBrickData(brickTypeId: string, data: unknown): void {
  getContext().setBrickData(brickTypeId, data);
}
