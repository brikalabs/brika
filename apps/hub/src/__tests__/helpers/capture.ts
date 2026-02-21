/** Capture console.log output */
export function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  return { lines, restore: () => (console.log = original) };
}

/** Capture console.error + trap process.exit */
export function captureExit() {
  const result = {
    code: undefined as number | undefined,
    errors: [] as string[],
    restore: () => {},
  };
  const origExit = process.exit;
  const origError = console.error;
  process.exit = ((c?: number) => {
    result.code = c;
    throw new Error('__EXIT__');
  }) as never;
  console.error = (...args: unknown[]) => result.errors.push(args.join(' '));
  result.restore = () => {
    process.exit = origExit;
    console.error = origError;
  };
  return result;
}
