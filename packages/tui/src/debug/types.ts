/**
 * Shared types for the engine's debug overlay (`<DebugProvider>` +
 * `<DebugOverlay>`). One entry per captured signal — console call,
 * uncaught error, or REPL result.
 */

export type DebugLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'repl' | 'system';

export interface DebugEntry {
  /** Monotonic id — stable React key, ordering within a session. */
  readonly id: number;
  readonly level: DebugLevel;
  /** Pre-formatted single string. Arrays of args are joined with a
   *  space, objects pretty-printed (depth-limited). */
  readonly text: string;
  /** When the entry was captured. */
  readonly timestamp: number;
  /** Free-form origin tag — `'console'`, `'uncaughtException'`, … */
  readonly source: string;
}

export interface DebugContextValue {
  readonly entries: ReadonlyArray<DebugEntry>;
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  readonly clear: () => void;
  /** Imperative push — useful for app code that wants to surface a
   *  custom event in the debug window without going through `console`. */
  readonly push: (level: DebugLevel, text: string, source?: string) => void;
  /** Evaluate a string of JavaScript in the engine's debug scope.
   *  Returns the value (or rejection) and appends a `repl` entry. */
  readonly evaluate: (code: string) => Promise<unknown>;
}
