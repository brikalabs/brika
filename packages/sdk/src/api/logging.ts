/**
 * Logging API
 *
 * Comprehensive logging with automatic error stack capture.
 */

import { getContext, type LogLevel } from '../context';
import type { AnyObj } from '../types';

/**
 * Log a message to the hub.
 *
 * @example
 * ```typescript
 * log("info", "Timer started", { id: timer.id });
 * log("error", "Failed to connect");
 *
 * // Or use convenience methods:
 * log.info("Timer started", { id: timer.id });
 * log.error("Failed to connect", { error: err });
 * ```
 */
export function log(level: LogLevel, message: string, meta?: AnyObj): void {
  getContext().log(level, message, meta);
}

/**
 * Log a debug message. Only shown when debug logging is enabled.
 *
 * @example
 * ```typescript
 * log.debug("Processing item", { itemId: 123 });
 * ```
 */
log.debug = (message: string, meta?: AnyObj): void => {
  log('debug', message, meta);
};

/**
 * Log an info message for general informational events.
 *
 * @example
 * ```typescript
 * log.info("Connection established", { host: "localhost" });
 * ```
 */
log.info = (message: string, meta?: AnyObj): void => {
  log('info', message, meta);
};

/**
 * Log a warning message for potentially problematic situations.
 *
 * @example
 * ```typescript
 * log.warn("Retry attempt failed", { attempt: 2, maxRetries: 3 });
 * ```
 */
log.warn = (message: string, meta?: AnyObj): void => {
  log('warn', message, meta);
};

/**
 * Log an error message. Automatically captures error stack traces.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   log.error("Operation failed", { error: err });
 * }
 * ```
 */
log.error = (message: string, meta?: AnyObj): void => {
  const enhancedMeta = meta ? { ...meta } : {};

  // Auto-capture error stack if an error object is provided
  if (meta?.error instanceof Error) {
    enhancedMeta.errorName = meta.error.name;
    enhancedMeta.errorMessage = meta.error.message;
    enhancedMeta.errorStack = meta.error.stack;
  }

  log('error', message, enhancedMeta);
};
