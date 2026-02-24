import { format } from "date-fns";
import pc from "picocolors";
import type { Json } from "@/types";
import type { LogError, LogEvent, LogLevel } from "../types";
import type { Formatter, TerminalFormatterOptions } from "./types";

const SOURCE_WIDTH = 18;
const META_INDENT = " ".repeat(16);

const LEVEL_STYLE: Record<LogLevel, { label: string; color: (text: string) => string; symbol: string }> = {
  error: { label: "error", color: pc.red, symbol: "✘" },
  warn: { label: "warn", color: pc.yellow, symbol: "▲" },
  info: { label: "info", color: pc.blue, symbol: "ℹ" },
  debug: { label: "debug", color: pc.gray, symbol: "◆" },
};

function formatTimestamp(ts: number): string {
  return format(ts, "yyyy-MM-dd HH:mm:ss");
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

function extractLocation(meta?: Record<string, Json>): {
  location: string | null;
  error: { name: string; message: string; stack?: string; cause?: string } | null;
  rest: Record<string, Json> | null;
} {
  if (!meta) return { location: null, error: null, rest: null };

  const { sourceFile, sourceLine, __error, ...rest } = meta;

  const location =
    typeof sourceFile === "string" && typeof sourceLine === "number"
      ? `${shortenPath(sourceFile)}:${sourceLine}`
      : null;

  // biome-ignore lint/suspicious/noExplicitAny: Error object extracted from Json-typed meta
  const error = __error && typeof __error === "object" ? __error as any : null;

  return {
    location,
    error,
    rest: Object.keys(rest).length > 0 ? rest : null,
  };
}

/** Format multi-line string with proper indentation */
function formatMultiLineString(value: string, color: boolean): string {
  const CONTINUATION_INDENT = " ".repeat(21);
  const lines = value.split("\n");
  const formatted = lines.map((line, i) => {
    if (i === 0) return line;
    return `${CONTINUATION_INDENT}${line}`;
  }).join("\n");
  return color ? pc.dim(formatted) : formatted;
}

/** Format a single JSON value with optional color */
function formatValue(value: Json, color: boolean): string {
  if (typeof value === "string") {
    return formatStringValue(value, color);
  }
  if (typeof value === "number") {
    return color ? pc.green(`${value}`) : `${value}`;
  }
  if (typeof value === "boolean") {
    return color ? pc.yellow(`${value}`) : `${value}`;
  }
  if (value === null) {
    return color ? pc.dim("null") : "null";
  }
  return Bun.inspect(value, { colors: color });
}

/** Format string value with optional color */
function formatStringValue(value: string, color: boolean): string {
  if (value.includes("\n")) {
    return formatMultiLineString(value, color);
  }
  return color ? pc.cyan(`"${value}"`) : `"${value}"`;
}

function formatMetadata(meta: Record<string, Json>, color: boolean): string {
  return Object.entries(meta)
    .map(([key, value], i, arr) => formatMetadataEntry(key, value, i, arr.length - 1, color))
    .join(`\n${META_INDENT}`);
}

/** Format a single metadata entry */
function formatMetadataEntry(key: string, value: Json, index: number, lastIndex: number, color: boolean): string {
  const prefix = index === lastIndex ? "└─" : "├─";
  const styledPrefix = color ? pc.dim(prefix) : prefix;
  const styledKey = color ? pc.magenta(key) : key;
  const styledSep = color ? pc.dim(": ") : ": ";
  const styledValue = formatValue(value, color);
  return `${styledPrefix} ${styledKey}${styledSep}${styledValue}`;
}

function styleMessage(message: string, level: LogLevel, color: (s: string) => string): string {
  if (level === "error") return pc.bold(color(message));
  if (level === "warn") return color(message);
  return message;
}

/** Build colored main log line parts */
function buildColoredParts(
  ts: string,
  style: (typeof LEVEL_STYLE)[LogLevel],
  srcPadded: string,
  message: string,
  level: LogLevel,
  location: string | null
): (string | null)[] {
  return [
    pc.dim(ts),
    style.color(`${style.symbol} ${style.label.padEnd(5)}`),
    pc.cyan(srcPadded),
    styleMessage(message, level, style.color),
    location ? pc.dim(pc.magenta(`@${location}`)) : null,
  ];
}

/** Build plain (non-colored) main log line parts */
function buildPlainParts(
  ts: string,
  style: (typeof LEVEL_STYLE)[LogLevel],
  srcPadded: string,
  message: string,
  location: string | null
): (string | null)[] {
  return [
    ts,
    style.label.toUpperCase().padEnd(5),
    srcPadded,
    message,
    location ? `[${location}]` : null,
  ];
}

/** Format error details into lines */
function formatErrorLines(error: LogError, color: boolean): string[] {
  const errorLines: string[] = [];

  // Error message
  errorLines.push(formatErrorMessage(error, color));

  // Stack trace
  if (error.stack) {
    errorLines.push(...formatStackTrace(error.stack, color));
  }

  // Cause if present
  if (error.cause) {
    errorLines.push(formatErrorCause(error.cause, color));
  }

  return errorLines;
}

/** Format error message line */
function formatErrorMessage(error: LogError, color: boolean): string {
  const errorMsg = error.message || "Unknown error";
  const errorLabel = color ? pc.red("Error:") : "Error:";
  return `${errorLabel} ${errorMsg}`;
}

/** Format stack trace lines */
function formatStackTrace(stack: string, color: boolean): string[] {
  const stackLines = stack.split("\n").slice(1); // Skip first line (already shown)
  return stackLines.map((line) => {
    const trimmed = line.trim();
    return `  ${color ? pc.dim(trimmed) : trimmed}`;
  });
}

/** Format error cause line */
function formatErrorCause(cause: string, color: boolean): string {
  const label = color ? pc.yellow("Caused by:") : "Caused by:";
  return `${label} ${cause}`;
}

export class TerminalFormatter implements Formatter {
  readonly #color: boolean;

  constructor(options: TerminalFormatterOptions) {
    this.#color = options.color;
  }

  format(event: LogEvent): string {
    const ts = formatTimestamp(event.ts);
    const src = event.pluginName ? `${event.source}:${event.pluginName}` : event.source;
    const srcPadded = src.padEnd(SOURCE_WIDTH).slice(0, SOURCE_WIDTH);
    const { location, error, rest } = extractLocation(event.meta);
    const style = LEVEL_STYLE[event.level];

    // Build main line
    const parts = this.#color
      ? buildColoredParts(ts, style, srcPadded, event.message, event.level, location)
      : buildPlainParts(ts, style, srcPadded, event.message, location);

    let output = parts.filter(Boolean).join(" ");

    // Add metadata if present
    if (rest) {
      output += `\n${META_INDENT}${formatMetadata(rest, this.#color)}`;
    }

    // Add error info if present
    if (error) {
      const errorLines = formatErrorLines(error, this.#color);
      const separator = `\n${META_INDENT}`;
      output += `${separator}${errorLines.join(separator)}`;
    }

    return output;
  }
}
