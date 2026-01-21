import type { Json, LogEvent, LogLevel } from "@brika/shared";
import pc from "picocolors";
import type { Formatter, TerminalFormatterOptions } from "./types";

const SOURCE_WIDTH = 18;
const META_INDENT = "                "; // 16 spaces

const LEVEL_STYLE: Record<LogLevel, { label: string; color: (text: string) => string; symbol: string }> = {
  error: { label: "error", color: pc.red, symbol: "✘" },
  warn: { label: "warn", color: pc.yellow, symbol: "▲" },
  info: { label: "info", color: pc.blue, symbol: "ℹ" },
  debug: { label: "debug", color: pc.gray, symbol: "◆" },
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

function formatValue(value: Json, color: boolean): string {
  if (typeof value === "string") {
    // Multi-line strings (like stack traces) should preserve formatting
    if (value.includes("\n")) {
      const lines = value.split("\n");
      const formatted = lines.map((line, i) => {
        if (i === 0) return line;
        return `                     ${line}`; // Indent continuation lines
      }).join("\n");
      return color ? pc.dim(formatted) : formatted;
    }
    return color ? pc.cyan(`"${value}"`) : `"${value}"`;
  }
  if (typeof value === "number") return color ? pc.green(`${value}`) : `${value}`;
  if (typeof value === "boolean") return color ? pc.yellow(`${value}`) : `${value}`;
  if (value === null) return color ? pc.dim("null") : "null";
  return Bun.inspect(value, { colors: color });
}

function formatMetadata(meta: Record<string, Json>, color: boolean): string {
  return Object.entries(meta)
    .map(([key, value], i, arr) => {
      const prefix = i === arr.length - 1 ? "└─" : "├─";
      const styledPrefix = color ? pc.dim(prefix) : prefix;
      const styledKey = color ? pc.magenta(key) : key;
      const styledSep = color ? pc.dim(": ") : ": ";
      const styledValue = formatValue(value, color);
      return `${styledPrefix} ${styledKey}${styledSep}${styledValue}`;
    })
    .join(`\n${META_INDENT}`);
}

function styleMessage(message: string, level: LogLevel, color: (s: string) => string): string {
  if (level === "error") return pc.bold(color(message));
  if (level === "warn") return color(message);
  return message;
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
      ? [
          pc.dim(ts),
          style.color(`${style.symbol} ${style.label.padEnd(5)}`),
          pc.cyan(srcPadded),
          styleMessage(event.message, event.level, style.color),
          location ? pc.dim(pc.magenta(`@${location}`)) : null,
        ]
      : [
          ts,
          style.label.toUpperCase().padEnd(5),
          srcPadded,
          event.message,
          location ? `[${location}]` : null,
        ];

    let output = parts.filter(Boolean).join(" ");

    // Add metadata if present
    if (rest) {
      output += `\n${META_INDENT}${formatMetadata(rest, this.#color)}`;
    }

    // Add error info if present
    if (error) {
      const errorLines: string[] = [];

      // Error message
      const errorMsg = error.message || "Unknown error";
      const errorLabel = this.#color ? pc.red("Error:") : "Error:";
      errorLines.push(`${errorLabel} ${errorMsg}`);

      // Stack trace
      if (error.stack) {
        const stackLines = error.stack.split("\n").slice(1); // Skip first line (already shown)
        for (const line of stackLines) {
          errorLines.push(`  ${this.#color ? pc.dim(line.trim()) : line.trim()}`);
        }
      }

      // Cause if present
      if (error.cause) {
        errorLines.push(`${this.#color ? pc.yellow("Caused by:") : "Caused by:"} ${error.cause}`);
      }

      output += `\n${META_INDENT}${errorLines.join(`\n${META_INDENT}`)}`;
    }

    return output;
  }
}
