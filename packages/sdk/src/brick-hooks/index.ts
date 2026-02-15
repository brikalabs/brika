/**
 * Brick Hooks — React-like hooks for brick components.
 *
 * Lightweight implementation: useState, useEffect, useMemo, useCallback, useRef.
 * No React dependency required.
 *
 * Actions are auto-registered: pass handler functions directly to builder props
 * (e.g. `onToggle`, `onPress`, `onChange`) — no manual registration needed.
 */

export { defineSharedStore, type SharedStore } from './define-shared-store';
export {
  _beginRender,
  _cleanupEffects,
  _createState,
  _endRender,
  _flushEffects,
  type BrickState,
} from './state';
export { useBrickSize } from './use-brick-size';
export { useEffect } from './use-effect';
export { useCallback, useMemo } from './use-memo';
export { usePluginPreference } from './use-plugin-preference';
export { usePreference } from './use-preference';
export { useRef } from './use-ref';
export { useState } from './use-state';
export { useIntl } from './use-intl';
export { useLocale } from './use-locale';
export { useTranslation } from './use-translation';
