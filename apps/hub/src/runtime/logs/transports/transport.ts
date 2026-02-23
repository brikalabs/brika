import type { LogEvent } from "../types";

/**
 * Transport interface for routing log events to different destinations.
 * Inspired by Winston and Pino transport patterns.
 */
export interface Transport {
  /**
   * Write a log event to this transport.
   * @param event - The log event to write
   */
  write(event: LogEvent): void;

  /**
   * Optional cleanup when transport is no longer needed.
   */
  close?(): void | Promise<void>;
}
