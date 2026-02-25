/**
 * Shared CLI test helper.
 *
 * Spawns a Bun script with `NO_COLOR=1` so assertions never deal with ANSI
 * escape codes, and ensures the process is killed on timeout.
 */

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawns `bun <script> [...args]` with colors disabled and a safety timeout.
 *
 * @param args - Arguments passed to `Bun.spawn` (e.g. `['bun', script, dir]`).
 * @param opts.timeout - Kill the process after this many ms (default 15 000).
 * @param opts.env - Extra env vars merged on top of `process.env`.
 */
export async function runCli(
  args: string[],
  opts: { timeout?: number; env?: Record<string, string> } = {},
): Promise<CliResult> {
  const { timeout = 15_000, env = {} } = opts;

  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });

  const timer = setTimeout(() => {
    proc.kill();
  }, timeout);

  try {
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}
