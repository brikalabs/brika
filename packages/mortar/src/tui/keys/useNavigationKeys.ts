/**
 * Main-view navigation keybinds: route changes, search nav.
 *
 *   Esc            clear active search (no-op when no search is active)
 *   / n N          enter search, next match, previous match
 *   ? d i f        open help / deps / input / toggle fullscreen
 *
 * `Tab` / `Shift+Tab` are NOT bound here — Ink's focus manager handles
 * panel cycling natively (service list ↔ log pane). Inside the focused
 * panel, `↑` / `↓` / `j` / `k` walk rows or scroll lines.
 *
 * Quit (`q` / `Ctrl+C`) is NOT registered here — it lives in
 * {@link useGlobalQuit} so it works from every screen.
 */

import { useRouter, useShortcut } from '@brika/tui';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';

export function useNavigationKeys(enabled: boolean): void {
  const { focus, scroll, search, toast, fullscreen } = useMortar();
  const router = useRouter<Routes>();
  const focused = focus.focused;

  useShortcut('f', () => fullscreen.toggle(), enabled);

  useShortcut(
    'escape',
    () => {
      search.clear();
      scroll.goLive();
    },
    enabled && Boolean(search.query)
  );

  useShortcut('/', () => search.enter(), enabled);
  useShortcut('n', () => search.next(), enabled);
  useShortcut('N', () => search.prev(), enabled);

  useShortcut('?', () => router.navigate('help'), enabled);
  useShortcut('d', () => router.navigate('deps'), enabled);
  useShortcut(
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
