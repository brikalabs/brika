import { singleton } from "@brika/di";
import type { Json } from "@/types";
import { TerminalFormatter } from "./formatters/terminal-formatter";
import type { LogStore } from "./log-store";
import { ConsoleTransport } from "./transports/console-transport";
import type { Transport } from "./transports/transport";
import type { LogError, LogEvent, LogLevel, LogSource } from "./types";
import { captureCallSite } from "./utils/call-site";
import { RingBuffer } from "./utils/ring-buffer";

export interface LogOptions {
  meta?: Record<string, Json>;
  error?: unknown;
  source?: LogSource;
}

type Subscriber = (event: LogEvent) => void;

/** Numeric severity used for both the pipeline gate and call-site capture. */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Resolve a level name from an env var, falling back when unset/invalid.
 * Uses an explicit allowlist instead of `value in LEVEL_ORDER` — the `in`
 * operator walks the prototype chain, so `BRIKA_LOG_LEVEL=toString` would
 * otherwise satisfy the check and silence the whole pipeline.
 */
const LEVEL_NAMES: ReadonlySet<LogLevel> = new Set(['debug', 'info', 'warn', 'error']);

function isLogLevel(value: string): value is LogLevel {
  return LEVEL_NAMES.has(value as LogLevel);
}

function parseLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  return value && isLogLevel(value) ? value : fallback;
}

/**
 * Resolve the minimum severity at which the (relatively expensive) call-site
 * stack capture runs. `BRIKA_LOG_CALLSITE` accepts a level name (capture at
 * that level and above), `all` (every level), or `off`/`none` (never).
 * Defaults to `warn` — file:line matters most for problems, and skipping it
 * for the high-volume info/debug path is the single biggest per-log saving.
 */
function parseCallSiteLevel(value: string | undefined): number {
  const normalized = value?.toLowerCase();
  if (!normalized) { return LEVEL_ORDER.warn; }
  if (normalized === 'off' || normalized === 'none' || normalized === '0') {
    return Number.POSITIVE_INFINITY;
  }
  if (normalized === 'all') { return 0; }
  return isLogLevel(normalized) ? LEVEL_ORDER[normalized] : LEVEL_ORDER.warn;
}

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
  if (process.env.NO_COLOR) { return false; }
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") { return true; }
  if (process.env.BRIKA_LOG_COLOR === "1") { return true; }
  if (process.env.BRIKA_LOG_COLOR === "0") { return false; }
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
  // Pipeline floor: a log below this severity short-circuits before any work
  // (call-site capture, meta merge, ring/store writes, transport + subscriber
  // fan-out). This is what makes disabled debug logging effectively free.
  #minLevel: number;
  readonly #callSiteLevel: number;

  constructor() {
    const level = parseLevel(process.env.BRIKA_LOG_LEVEL, "info");
    const formatter = new TerminalFormatter({ color: shouldUseColor() });

    this.#minLevel = LEVEL_ORDER[level];
    this.#callSiteLevel = parseCallSiteLevel(process.env.BRIKA_LOG_CALLSITE);
    this.#ring = new RingBuffer<LogEvent>(5000);
    this.#transports.push(new ConsoleTransport({ level, formatter }));
  }

  /**
   * Set default log source for this logger instance.
   */
  setSource(source: LogSource): void {
    this.#defaultSource = source;
  }

  /**
   * Raise or lower the pipeline floor at runtime. Logs below `level` are
   * dropped before any work happens (see {@link #minLevel}).
   */
  setLevel(level: LogLevel): void {
    this.#minLevel = LEVEL_ORDER[level];
  }

  /** True when a log at `level` would pass the pipeline floor. */
  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= this.#minLevel;
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
    this.#store?.enqueue(event);

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
    // Pipeline floor: bail out before any allocation or stack capture so a
    // disabled level (e.g. debug at the default `info` floor) is essentially
    // free to call.
    if (LEVEL_ORDER[level] < this.#minLevel) { return; }

    const logMeta: Record<string, Json> = {
      ...meta,
      ...options?.meta,
      // Call-site capture builds + parses an Error stack; only pay for it at
      // or above the configured threshold (warn by default).
      ...(LEVEL_ORDER[level] >= this.#callSiteLevel ? captureCallSite() : undefined),
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
