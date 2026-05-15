/**
 * Optional TUI support for `@brika/cli`. Wraps ink's `render` so consumers
 * don't have to think about waitUntilExit, raw-mode quirks, or the
 * lifecycle dance every command repeats.
 *
 * `ink` and `react` are declared as OPTIONAL peer deps — packages that
 * only build plain CLI commands never load them. Importing from this
 * module without ink installed throws a clear error pointing at the
 * install command.
 */

import {
  type ComponentType,
  createElement,
  Fragment,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import type { Command, CommandOption, HandlerArgs } from './command';

declare global {
  // Set by `@brika/tui/refresh`'s preload when running in dev. We
  // auto-wrap the rendered tree with the boundary (catches render-
  // and commit-time throws so they don't tear down the Ink root)
  // and the sibling overlay (shows the error message). In production
  // both globals are unset and the branches below are dead.
  var __brikaHmrOverlay: ComponentType | undefined;
  var __brikaHmrBoundary: ComponentType<PropsWithChildren> | undefined;
}

export interface RunTuiOptions {
  /**
   * Forwarded to ink's `Instance.exitOnCtrlC`. Default `true`. Set to
   * `false` if the rendered tree handles Ctrl+C itself (e.g. a service
   * supervisor that needs to flush before exit).
   */
  readonly exitOnCtrlC?: boolean;
  /**
   * Clear the terminal scrollback + reset the cursor before rendering.
   * Default `true` so the TUI starts on a fresh canvas. Set `false` if
   * the caller wants to preserve previous shell output (e.g. a wrapper
   * that prints a banner first).
   */
  readonly clearOnStart?: boolean;
}

/**
 * Render an ink element, then resolve when the user exits (Ctrl+C, `q`,
 * or the tree calls `useApp().exit()`).
 */
export async function runTui(element: ReactElement, options: RunTuiOptions = {}): Promise<void> {
  const ink = await loadInk();
  // Clear the scrollback + cursor so the TUI starts on a fresh canvas.
  // Without this, anything the parent shell printed (prompts, build
  // logs, the user's previous command) bleeds through ink's alt-screen
  // and shifts the layout on the first render. Skipped when stdout
  // isn't a TTY (piped output, CI) so we don't emit escape codes to
  // log files.
  if (options.clearOnStart !== false && process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  }
  const Overlay = globalThis.__brikaHmrOverlay;
  const Boundary = globalThis.__brikaHmrBoundary;
  const wrapped = Boundary ? createElement(Boundary, null, element) : element;
  const tree = Overlay ? createElement(Fragment, null, wrapped, createElement(Overlay)) : wrapped;
  const instance = ink.render(tree, {
    exitOnCtrlC: options.exitOnCtrlC ?? true,
  });
  await instance.waitUntilExit();
}

/**
 * Sugar over `defineCommand` for commands whose handler is "render this
 * ink tree, wait for it to exit." The returned object is a regular
 * `Command` so it composes with `createCli().addCommand(...)`.
 *
 * Use this when the command's whole job is to drive a TUI. For commands
 * that mix synchronous setup and a TUI mid-way, call {@link runTui}
 * directly from a regular `defineCommand` handler.
 */
export function defineTuiCommand<const O extends Record<string, CommandOption>>(def: {
  readonly name: string;
  readonly description: string;
  readonly details?: string;
  readonly options?: O;
  readonly aliases?: string[];
  readonly examples?: string[];
  /**
   * Build the React element to render. Receives the same `HandlerArgs`
   * as a normal command handler. May be async — useful for loading
   * config / spinning up a supervisor before rendering.
   */
  readonly render: (args: HandlerArgs<O>) => ReactElement | Promise<ReactElement>;
  /** Forwarded to {@link runTui}. */
  readonly tui?: RunTuiOptions;
}): Command {
  return {
    name: def.name,
    description: def.description,
    details: def.details,
    options: def.options,
    aliases: def.aliases,
    examples: def.examples,
    async handler(args) {
      const element = await def.render(args as HandlerArgs<O>);
      await runTui(element, def.tui);
    },
  };
}

interface InkModule {
  render: (
    element: ReactElement,
    options?: { exitOnCtrlC?: boolean }
  ) => {
    waitUntilExit: () => Promise<void>;
  };
}

async function loadInk(): Promise<InkModule> {
  try {
    // Dynamic import keeps ink off the cold path for non-TUI consumers
    // and lets the error message be specific when it's missing.
    return (await import('ink')) as unknown as InkModule;
  } catch (cause) {
    throw new Error(
      "Couldn't load `ink` — install it as a peer of @brika/cli to use TUI commands.\n" +
        '  bun add ink react',
      { cause }
    );
  }
}
