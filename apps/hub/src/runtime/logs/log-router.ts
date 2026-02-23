import { singleton } from "@brika/di";
import type { Json } from "@/types";
import type { LogError, LogEvent, LogLevel, LogSource } from "./types";
import { TerminalFormatter } from "./formatters/terminal-formatter";
import type { LogStore } from "./log-store";
import { ConsoleTransport } from "./transports/console-transport";
import type { Transport } from "./transports/transport";
import { captureCallSite } from "./utils/call-site";
import { RingBuffer } from "./utils/ring-buffer";

export interface LogRouterOptions {
  level: LogLevel;
  color: boolean;
  ringSize?: number;
}

export interface LogOptions {
  meta?: Record<string, Json>;
  error?: unknown;
  source?: LogSource;
}

type Subscriber = (event: LogEvent) => void;

function extractLogError(error: unknown): LogError {
  if (error instanceof Error) {
    const logError: LogError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    if (error.cause) {
      logError.cause =
        error.cause instanceof Error
          ? `${error.cause.name}: ${error.cause.message}`
          : JSON.stringify(error.cause);
    }
    return logError;
  }
  if (typeof error === "object" && error !== null) {
    return { name: "Error", message: JSON.stringify(error) };
  }
  return {
    name: "Error",
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

/**
 * Scoped logger that wraps a Logger instance with a preset source.
 */
export class ScopedLogger {
  readonly #logger: Logger;
  readonly #source: LogSource;

  constructor(logger: Logger, source: LogSource) {
    this.#logger = logger;
    this.#source = source;
  }

  debug(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#logger.debug(message, meta, { ...options, source: options?.source ?? this.#source });
  }

  info(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#logger.info(message, meta, { ...options, source: options?.source ?? this.#source });
  }

  warn(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#logger.warn(message, meta, { ...options, source: options?.source ?? this.#source });
  }

  error(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#logger.error(message, meta, { ...options, source: options?.source ?? this.#source });
  }

  /**
   * Emit a log event directly (passthrough to logger)
   */
  emit(event: LogEvent): void {
    this.#logger.emit(event);
  }

  /**
   * Create another scoped logger with a different source.
   */
  withSource(source: LogSource): ScopedLogger {
    return new ScopedLogger(this.#logger, source);
  }
}

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") return true;
  if (process.env.BRIKA_LOG_COLOR === "1") return true;
  if (process.env.BRIKA_LOG_COLOR === "0") return false;
  return process.stdout.isTTY ?? false;
}

/**
 * Main logging system for Brika Hub.
 */
@singleton()
export class Logger {
  readonly #transports: Transport[] = [];
  readonly #subscribers = new Set<Subscriber>();
  readonly #ring: RingBuffer<LogEvent>;
  #store: LogStore | null = null;
  #defaultSource: LogSource = "hub";

  constructor() {
    const level = (process.env.BRIKA_LOG_LEVEL ?? "info") as LogLevel;
    const formatter = new TerminalFormatter({ color: shouldUseColor() });

    this.#ring = new RingBuffer<LogEvent>(5000);
    this.#transports.push(new ConsoleTransport({ level, formatter }));
  }

  /**
   * Set default log source for this logger instance.
   */
  setSource(source: LogSource): void {
    this.#defaultSource = source;
  }

  setStore(store: LogStore): void {
    this.#store = store;
  }

  subscribe(fn: Subscriber): () => void {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }

  addTransport(transport: Transport): void {
    this.#transports.push(transport);
  }

  emit(event: LogEvent): void {
    this.#ring.push(event);
    this.#store?.insert(event);

    for (const transport of this.#transports) {
      transport.write(event);
    }

    for (const subscriber of this.#subscribers) {
      subscriber(event);
    }
  }

  query(): LogEvent[] {
    return this.#ring.snapshot();
  }

  #log(
    level: LogLevel,
    message: string,
    meta?: Record<string, Json>,
    options?: LogOptions
  ): void {
    const logMeta: Record<string, Json> = {
      ...meta,
      ...options?.meta,
      ...captureCallSite(),
    };

    const logError = options?.error ? extractLogError(options.error) : undefined;

    this.emit({
      ts: Date.now(),
      level,
      source: options?.source ?? this.#defaultSource,
      message,
      meta: logMeta,
      error: logError,
    });
  }

  debug(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#log("debug", message, meta, options);
  }

  info(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#log("info", message, meta, options);
  }

  warn(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#log("warn", message, meta, options);
  }

  error(message: string, meta?: Record<string, Json>, options?: LogOptions): void {
    this.#log("error", message, meta, options);
  }

  /**
   * Create a scoped logger with a default source.
   * All logs from this logger will use the specified source unless overridden.
   */
  withSource(source: LogSource): ScopedLogger {
    return new ScopedLogger(this, source);
  }
}
