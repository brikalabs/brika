/**
 * Global quit keybind — `q` and `Ctrl+C` shut down from any screen.
 *
 * Two exceptions where the keys are NOT global:
 *
 *   1. Input-forwarding mode: keystrokes go to the child's stdin, so
 *      `q` and `Ctrl+C` are forwarded. The user exits input mode with
 *      Esc, then quits normally.
 *   2. Active search prompt (`/foo` being typed): `q` is part of the
 *      query. We honor `Ctrl+C` only when not typing.
 *
 * Mounted once from `App.tsx` so it lives at the root regardless of
 * route. The shutdown overlay has its own Ctrl+C handler for force-exit,
 * which fires after this one (ink stacks `useInput` registrations).
 */

import { useKey, useRouter, useTuiShell } from '@brika/tui';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';

export function useGlobalQuit(): void {
  const router = useRouter<Routes>();
  const { search } = useMortar();
  const { onQuit } = useTuiShell();
  const inInputMode = router.current.name === 'input';
  const inSearchPrompt = search.mode === 'searching';

  // `q` only fires outside input/search modes — otherwise it's a typed character.
  useKey('q', () => onQuit(), !inInputMode && !inSearchPrompt);
  // `Ctrl+C` fires outside input mode (in search prompt it's still a quit signal,
  // matching common shell behavior).
  useKey('ctrl+c', () => onQuit(), !inInputMode);
}
