const STACK_REGEX_WITH_PARENS = /\((.+):(\d+):\d+\)$/;
const STACK_REGEX_WITHOUT_PARENS = /at\s+(.+):(\d+):\d+$/;

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
    const match = STACK_REGEX_WITH_PARENS.exec(line) || STACK_REGEX_WITHOUT_PARENS.exec(line);
    if (!match) continue;

    return {
      sourceFile: match[1],
      sourceLine: Number.parseInt(match[2], 10),
    };
  }

  return {};
}
