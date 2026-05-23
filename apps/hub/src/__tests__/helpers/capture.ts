/** Capture console.log output */
export function captureLog(): {
  lines: string[];
  restore: () => void;
} {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  return {
    lines,
    restore: () => (console.log = original),
  };
}
