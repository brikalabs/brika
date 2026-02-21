/**
 * Option descriptor extending Node's parseArgs format with a description for help display.
 */
export interface CommandOption {
  type: 'string' | 'boolean';
  short?: string;
  description?: string;
}

/**
 * Declarative command definition.
 * All metadata is inferred from this single object.
 */
export interface Command {
  /** Command name (e.g., 'start', 'stop') */
  name: string;

  /** One-line description shown in help */
  description: string;

  /** Multi-line detailed description (optional) */
  details?: string;

  /** Command-specific options (passed to parseArgs, with optional description for help) */
  options?: Record<string, CommandOption>;

  /** Alternative names or flags that invoke this command (e.g., ['-v', '--version']) */
  aliases?: string[];

  /** Usage examples (displayed in help) */
  examples?: string[];

  /** Handler function that receives parsed args */
  handler: (args: {
    values: Record<string, string | boolean | undefined>;
    positionals: string[];
  }) => Promise<void> | void;
}
