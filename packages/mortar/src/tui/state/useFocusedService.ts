/**
 * Focus state for the service list. Keyed by service id (not index) so
 * the selection survives reorderings / additions and so the `<List>`
 * primitive — which is value-based — can drive it directly.
 *
 * Falls back to the first service whenever the stored id is null or
 * no longer present, so callers never have to defensively `?? services[0]`.
 * When the list is empty, `focused` is `null`.
 */

import { useCallback, useState } from 'react';
import type { ServiceState } from '../../supervisor';

export interface FocusedServiceControls {
  readonly focusedIndex: number;
  readonly focusedId: string | null;
  readonly focused: ServiceState | null;
  readonly setFocusedId: (id: string) => void;
}

export function useFocusedService(services: ReadonlyArray<ServiceState>): FocusedServiceControls {
  const [storedId, setStoredId] = useState<string | null>(null);

  const idx = storedId ? services.findIndex((s) => s.spec.id === storedId) : -1;
  const focusedIndex = idx === -1 ? 0 : idx;
  const focused = services[focusedIndex] ?? null;
  const focusedId = focused?.spec.id ?? null;

  const setFocusedId = useCallback((id: string): void => setStoredId(id), []);

  return { focusedIndex, focusedId, focused, setFocusedId };
}
