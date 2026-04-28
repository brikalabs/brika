import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Tracks whether the viewport is narrower than the mobile breakpoint
 * (768 px). Starts `false` on the server; flips to the real value once
 * mounted so SSR renders stay stable.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  return isMobile;
}
