import type { LogEvent, LogLevel } from "../types";
import type { Formatter } from "../formatters/types";
import type { Transport } from "./transport";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface ConsoleTransportOptions {
  level: LogLevel;
  formatter: Formatter;
}

/**
 * Console transport - writes formatted logs to stdout/stderr.
 */
export class ConsoleTransport implements Transport {
  readonly #minLevel: LogLevel;
  readonly #formatter: Formatter;

  constructor(options: ConsoleTransportOptions) {
    this.#minLevel = options.level;
    this.#formatter = options.formatter;
  }

  write(event: LogEvent): void {
    // Filter based on minimum level
    if (LEVEL_ORDER[event.level] < LEVEL_ORDER[this.#minLevel]) {
      return;
    }

    // Format and output to appropriate stream
    const formatted = this.#formatter.format(event);
    const output = event.level === "error" ? console.error : console.log;
    output(formatted);
  }
}
