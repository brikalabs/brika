/**
 * Tab/focus state for the service list. Clamps to a valid index so the
 * caller never has to defensively `?? services[0]`. When the list is
 * empty, `focused` is `null`.
 */

import { useState } from 'react';
import type { ServiceState } from '../../supervisor';

export interface FocusedServiceControls {
  readonly focusedIndex: number;
  readonly focused: ServiceState | null;
  readonly setFocusedIndex: (updater: (n: number) => number) => void;
}

export function useFocusedService(services: ReadonlyArray<ServiceState>): FocusedServiceControls {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const focused = services[focusedIndex] ?? services[0] ?? null;
  return { focusedIndex, focused, setFocusedIndex };
}
