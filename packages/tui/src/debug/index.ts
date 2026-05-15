/**
 * Engine debug overlay — captures console writes / errors and lets
 * the user open a window with a REPL on top of the running app.
 * Drop `<DebugProvider>` near the root and press `Ctrl+D` to toggle.
 */

export { DebugOverlay } from './DebugOverlay';
export { DebugProvider, type DebugProviderProps } from './DebugProvider';
export { type EvaluateResult, evaluate } from './evaluate';
export { formatArgs, formatValue } from './format';
export type { DebugContextValue, DebugEntry, DebugLevel } from './types';
export { DebugContext, tryUseDebug, useDebug } from './useDebug';
