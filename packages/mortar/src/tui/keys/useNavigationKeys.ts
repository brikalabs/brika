/**
 * Main-view navigation keybinds: tab focus, route changes, search nav.
 *
 *   Esc            clear active search (no-op when no search is active)
 *   Tab / Shift+Tab cycle focused service
 *   / n N          enter search, next match, previous match
 *   ? d i f        open help / deps / input / toggle fullscreen
 *
 * Quit (`q` / `Ctrl+C`) is NOT registered here — it lives in
 * {@link useGlobalQuit} so it works from every screen.
 */

import { useRouter } from '../../router';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';
import { useKey } from './useKey';

export function useNavigationKeys(enabled: boolean): void {
  const { services, focus, scroll, search, toast, fullscreen } = useMortar();
  const router = useRouter<Routes>();
  const focused = focus.focused;

  useKey('f', () => fullscreen.toggle(), enabled);

  useKey(
    'escape',
    () => {
      search.clear();
      scroll.goLive();
    },
    enabled && Boolean(search.query)
  );

  useKey(
    'tab',
    () => {
      focus.setFocusedIndex((i) => (i + 1) % services.length);
      scroll.goLive();
    },
    enabled && services.length > 0
  );
  useKey(
    'shift+tab',
    () => {
      focus.setFocusedIndex((i) => (i - 1 + services.length) % services.length);
      scroll.goLive();
    },
    enabled && services.length > 0
  );

  useKey('/', () => search.enter(), enabled);
  useKey('n', () => search.next(), enabled);
  useKey('N', () => search.prev(), enabled);

  useKey('?', () => router.navigate('help'), enabled);
  useKey('d', () => router.navigate('deps'), enabled);
  useKey(
    'i',
    () => {
      if (!focused) {
        return;
      }
      if (focused.status.kind !== 'healthy' && focused.status.kind !== 'starting') {
        toast.showToast(`Can't forward input — ${focused.spec.label} is ${focused.status.kind}`);
        return;
      }
      router.navigate('input', { serviceId: focused.spec.id });
      toast.showToast(`Input mode → ${focused.spec.label}. Esc to exit.`);
    },
    enabled
  );
}
