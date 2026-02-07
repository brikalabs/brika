/**
 * Brick Hooks — React-like hooks for brick components.
 *
 * Lightweight implementation: useState, useEffect, useMemo, useCallback, useRef, useAction.
 * No React dependency required.
 */

export { type BrickState, _beginRender, _cleanupEffects, _createState, _endRender, _flushEffects } from './state';
export { useState } from './use-state';
export { useEffect } from './use-effect';
export { useMemo, useCallback } from './use-memo';
export { useRef } from './use-ref';
export { useAction } from './use-action';
export { useBrickSize } from './use-brick-size';
export { usePreference } from './use-preference';
export { usePluginPreference } from './use-plugin-preference';
