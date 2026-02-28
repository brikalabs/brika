/**
 * Option descriptor extending Node's parseArgs format with a description for help display.
 *
 * - `type: 'string'`  → parsed as string
 * - `type: 'boolean'` → parsed as boolean flag
 * - `type: 'number'`  → parsed as string by parseArgs, auto-coerced to number by the CLI
 * - `default`         → applied when the option is not provided; makes the value non-optional
 */
export interface CommandOption {
  type: 'string' | 'boolean' | 'number';
  short?: string;
  description?: string;
  default?: string | boolean | number;
}

/**
 * Command context - passed to handlers
 */
export interface CommandContext<O extends Record<string, CommandOption> | undefined = undefined>
  extends HandlerArgs<O> {
  // Extended in CLI integration
}

/**
 * Middleware type - wraps handlers
 */
export type Middleware<O extends Record<string, CommandOption> | undefined = undefined> = (
  handler: (args: HandlerArgs<O>) => Promise<void> | void
) => (args: HandlerArgs<O>) => Promise<void> | void;

/** Resolve the base JS type for an option's `type` field. */
type BaseValue<T extends CommandOption> = T['type'] extends 'boolean'
  ? boolean
  : T['type'] extends 'number'
    ? number
    : string;

/** If a default is declared, the value is guaranteed (non-optional). */
type InferValue<T extends CommandOption> = T extends { default: string | boolean | number }
  ? BaseValue<T>
  : BaseValue<T> | undefined;

/** Map an options record to its parsed values type. */
type InferValues<O extends Record<string, CommandOption> | undefined> =
  O extends Record<string, CommandOption>
    ? { [K in keyof O]: InferValue<O[K]> }
    : Record<string, string | boolean | number | undefined>;

export interface HandlerArgs<O extends Record<string, CommandOption> | undefined = undefined> {
  values: InferValues<O>;
  positionals: string[];
  commands: Command[];
}

/**
 * Declarative command definition.
 * All metadata is inferred from this single object.
 */
export interface Command {
  name: string;
  description: string;
  details?: string;
  options?: Record<string, CommandOption>;
  aliases?: string[];
  examples?: string[];
  subcommands?: Command[];
  handler: (args: HandlerArgs) => Promise<void> | void;
}

/**
 * Define a command with fully typed option values in the handler.
 *
 * Uses `const` type parameter to preserve literal types from option descriptors,
 * giving the handler properly narrowed values based on `type` and `default`.
 */
export function defineCommand<const O extends Record<string, CommandOption>>(def: {
  name: string;
  description: string;
  details?: string;
  options?: O;
  aliases?: string[];
  examples?: string[];
  handler: (args: HandlerArgs<O>) => Promise<void> | void;
}): Command {
  return def as Command;
}
