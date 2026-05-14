/**
 * Strip ANSI escape sequences so log output can be written to a file
 * or piped to a non-color-aware tool (pbcopy, file viewer) without
 * showing raw `\x1b[...m` bytes.
 *
 * Shared by `saveLog.ts` and `clipboard.ts`.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ESC bytes is the whole job
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsiForFile(line: string): string {
  return line.replace(ANSI_RE, '');
}
