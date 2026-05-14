/**
 * Main view — the default screen.
 *
 *   left:   ServiceList   (focused service highlighted)
 *   right:  LogPane       (windowed tail of focused service)
 *   bottom: Footer        (URL line + keybinds / search status / toast)
 *
 * Reads everything from `useMortar()`. Keybinds live in `mainKeys.ts`
 * and are registered with a single hook call so this file stays
 * focused on layout. The actual layout is in `<MainLayout>`, shared
 * with `<InputView>`.
 */

import type React from 'react';
import { MainLayout } from '../components/MainLayout';
import { useMainKeybinds } from '../keys/useMainKeybinds';

export function MainView(): React.ReactElement {
  useMainKeybinds();
  return <MainLayout inputModeFor={null} />;
}
