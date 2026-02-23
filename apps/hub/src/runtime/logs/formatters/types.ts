import type { LogEvent } from "../types";

/**
 * Formatter transforms a LogEvent into a string for output.
 */
export interface Formatter {
  /**
   * Format a log event into a string.
   * @param event - The log event to format
   * @returns Formatted string ready for output
   */
  format(event: LogEvent): string;
}

/**
 * Options for terminal formatting.
 */
export interface TerminalFormatterOptions {
  /**
   * Enable ANSI color codes for terminal output.
   */
  color: boolean;
}
