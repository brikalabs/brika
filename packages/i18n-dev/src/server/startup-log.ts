export interface StartupSummaryInput {
  readonly localesDir: string | null;
  readonly apiUrl: string | null;
  readonly sourceCount: number;
  readonly rootDir: string;
}

interface Logger {
  info(msg: string, opts?: { timestamp?: boolean }): void;
}

/**
 * Strip the workspace root prefix from an absolute path. Used in startup
 * logs so the message lines stay short and don't leak the user's home dir.
 */
export function relativeTo(root: string, target: string): string {
  if (target.startsWith(`${root}/`)) {
    return target.slice(root.length + 1);
  }
  return target;
}

export function describeMode(input: StartupSummaryInput): 'dual' | 'local' | 'remote' {
  if (input.localesDir && input.apiUrl) {
    return 'dual';
  }
  if (input.localesDir) {
    return 'local';
  }
  return 'remote';
}

/**
 * One-line summary of how the plugin will operate. Surfaces enough at server
 * boot for "wait, why aren't my translations showing up?" to be answerable
 * without grepping options.
 */
export function logStartupSummary(logger: Logger, input: StartupSummaryInput): void {
  const parts: string[] = [];
  if (input.localesDir) {
    parts.push(`local=${relativeTo(input.rootDir, input.localesDir)}`);
  }
  if (input.apiUrl) {
    parts.push(`api=${input.apiUrl}`);
  }
  if (input.sourceCount > 0) {
    parts.push(`sources=${input.sourceCount}`);
  }
  logger.info(`[i18n-dev] ${describeMode(input)} (${parts.join(', ')})`, { timestamp: true });
}
