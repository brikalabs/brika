/**
 * Logging API
 *
 * Comprehensive logging with automatic error stack capture and source location tracking.
 */

import { getContext } from '../context';
import type { AnyObj } from '../types';

/**
 * Captures the call site information from the stack trace.
 * Returns file path and line number where the log was triggered.
 * @param depth - Stack depth to capture (default: 3 for direct log calls)
 */
function captureCallSite(depth = 3): { sourceFile?: string; sourceLine?: number } {
  const err = new Error();
  const stack = err.stack;
  if (!stack) return {};

  const lines = stack.split('\n');
  const callerLine = lines[depth];
  if (!callerLine) return {};

  // Parse stack line: "at functionName (file:line:column)" or "at file:line:column"
  const match =
    callerLine.match(/\((.+):(\d+):(\d+)\)$/) || callerLine.match(/at\s+(.+):(\d+):(\d+)$/);
  if (!match) return {};

  const [, filePath, lineNumber] = match;
  return {
    sourceFile: filePath,
    sourceLine: lineNumber ? Number.parseInt(lineNumber, 10) : undefined,
  };
}

/**
 * Logger interface with method-based API.
 */
export interface Logger {
  debug(message: string, meta?: AnyObj): void;
  info(message: string, meta?: AnyObj): void;
  warn(message: string, meta?: AnyObj): void;
  error(message: string, meta?: AnyObj): void;
}

/**
 * Logging API with method-based interface.
 *
 * @example
 * ```typescript
 * log.info("Timer started", { id: timer.id });
 * log.error("Failed to connect", { error: err });
 * log.debug("Processing item", { itemId: 123 });
 * log.warn("Retry attempt failed", { attempt: 2 });
 * ```
 */
export const log: Logger = {
  /**
   * Log a debug message. Only shown when debug logging is enabled.
   */
  debug(message: string, meta?: AnyObj): void {
    const callSite = captureCallSite();
    const enhancedMeta = { ...meta, ...callSite };
    getContext().log('debug', message, enhancedMeta);
  },

  /**
   * Log an info message for general informational events.
   */
  info(message: string, meta?: AnyObj): void {
    const callSite = captureCallSite();
    const enhancedMeta = { ...meta, ...callSite };
    getContext().log('info', message, enhancedMeta);
  },

  /**
   * Log a warning message for potentially problematic situations.
   */
  warn(message: string, meta?: AnyObj): void {
    const callSite = captureCallSite();
    const enhancedMeta = { ...meta, ...callSite };
    getContext().log('warn', message, enhancedMeta);
  },

  /**
   * Log an error message. Automatically captures error stack traces.
   */
  error(message: string, meta?: AnyObj): void {
    const callSite = captureCallSite();
    const enhancedMeta: AnyObj = { ...meta, ...callSite };

    // Auto-capture error stack if an error object is provided
    if (meta?.error instanceof Error) {
      enhancedMeta.errorName = meta.error.name;
      enhancedMeta.errorMessage = meta.error.message;
      enhancedMeta.errorStack = meta.error.stack;
    }

    getContext().log('error', message, enhancedMeta);
  },
};
