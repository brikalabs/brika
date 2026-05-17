/**
 * Fullscreen mode: hides the service list so the log pane gets the
 * full terminal width. Toggled via the `f` keybind. Persists across
 * route changes (state lives in the provider, not in any view).
 */

import { useCallback, useState } from 'react';

export interface FullscreenControls {
  readonly enabled: boolean;
  readonly toggle: () => void;
}

export function useFullscreen(): FullscreenControls {
  const [enabled, setEnabled] = useState(false);
  const toggle = useCallback(() => {
    setEnabled((v) => !v);
  }, []);
  return { enabled, toggle };
}
