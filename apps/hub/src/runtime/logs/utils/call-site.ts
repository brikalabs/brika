// Atomic grouping via lookahead prevents backtracking (ReDoS protection)
const STACK_REGEX_WITH_PARENS = /\((?=((?:[A-Za-z]:)?[^):]+))\1:(\d+):\d+\)$/;
const STACK_REGEX_WITHOUT_PARENS = /at\s+(?=((?:[A-Za-z]:)?[^:\s]+))\1:(\d+):\d+$/;

/**
 * Parses a single stack trace line to extract file path and line number.
 * Exported for testing purposes.
 */
export function parseStackLine(
  line: string
): { sourceFile: string; sourceLine: number } | null {
  const match =
    STACK_REGEX_WITH_PARENS.exec(line) || STACK_REGEX_WITHOUT_PARENS.exec(line);
  if (!match) return null;

  return {
    sourceFile: match[1],
    sourceLine: Number.parseInt(match[2], 10),
  };
}

/**
 * Captures the call site from stack trace, skipping logger infrastructure frames.
 */
export function captureCallSite(): { sourceFile?: string; sourceLine?: number } {
  const stack = new Error("trace").stack;
  if (!stack) return {};

  const lines = stack.split("\n");

  // Skip frames that are part of the logging infrastructure
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip frames from log-router.ts and call-site.ts (logging infrastructure)
    if (line.includes("log-router.ts") || line.includes("call-site.ts")) {
      continue;
    }

    // This is the actual caller - extract file and line number
    const result = parseStackLine(line);
    if (!result) continue;

    return result;
  }

  return {};
}
