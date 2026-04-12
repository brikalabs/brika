/** Read a CLI flag value from process.argv, or return the fallback. */
export function cliFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 ? process.argv[idx + 1] : undefined) ?? fallback;
}
