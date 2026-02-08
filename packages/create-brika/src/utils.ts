/**
 * Utility functions for create-brika CLI
 */

/**
 * Convert kebab-case to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert kebab-case to camelCase
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Get git user name
 */
export async function getGitUser(): Promise<string> {
  try {
    const proc = Bun.spawn(['git', 'config', 'user.name'], {
      stdout: 'pipe',
    });
    const text = await new Response(proc.stdout).text();
    return text.trim();
  } catch {
    return '';
  }
}

/**
 * Run a command in a directory
 */
export async function runCommand(cmd: string[], cwd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
