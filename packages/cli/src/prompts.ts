/**
 * Brika prompts — thin pass-through over @clack/prompts plus a handful
 * of brika-specific helpers that capture patterns every CLI in the
 * monorepo already repeats by hand.
 *
 * Centralised so every CLI surface (`brika`, `create-brika`, `mortar`,
 * `workspace-tools`, hub setup wizards) shares one prompt library
 * version, one set of cancellation semantics, and a single seam for
 * future brika-branded styling without touching call sites.
 *
 * Keep this file *thin*. Re-export verbatim. Add helpers only when
 * they capture brika-specific behaviour every caller should share —
 * not opinions one caller happens to want today.
 *
 * Usage mirrors clack:
 *   import * as p from '@brika/cli/prompts';
 *   await p.confirmOrAbort({ message: 'Continue?' });
 *   if (p.isCI) {
 *     // skip the prompts, go straight to defaults
 *   }
 */

import { cancel, confirm, isCancel } from '@clack/prompts';

export type {
  ConfirmOptions,
  MultiSelectOptions,
  NoteOptions,
  Option,
  SelectOptions,
  SpinnerResult,
  TextOptions,
} from '@clack/prompts';
export {
  cancel,
  confirm,
  group,
  intro,
  isCancel,
  isCI,
  isTTY,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';

/** Options for {@link confirmOrAbort}. */
export interface ConfirmOrAbortOptions {
  /** Question shown to the user. */
  message: string;
  /** Default focus when the prompt opens. Defaults to `true`. */
  initialValue?: boolean;
  /** Banner printed when the user cancels or declines. Defaults to "Aborted." */
  abortMessage?: string;
  /**
   * Exit code on abort. Defaults to `0` — interactive cancellation isn't
   * treated as an error.
   *
   * For CI/headless callers, prefer a `--yes` flag so the prompt is never
   * reached. If a CI run *does* hit this prompt (no TTY → clack returns
   * cancel), the default exit `0` will look like a successful no-op. Pass
   * `exitCode: 1` (or check {@link isCI}/{@link isTTY} up-front) when a
   * silent skip would mask a real failure.
   */
  exitCode?: number;
}

/**
 * Ask a yes/no question, or terminate the process cleanly.
 *
 * Folds the "confirm + isCancel + decline → abort + exit" pattern that
 * every interactive command repeats into one line:
 *
 *   await confirmOrAbort({ message: 'Continue?' });
 *   // ... if we get here, the user said yes.
 *
 * On Ctrl-C or "no", the function prints a styled abort line via
 * `cancel()` and calls `process.exit(exitCode)` — no boolean to thread
 * through the handler. See {@link ConfirmOrAbortOptions.exitCode} for
 * the CI-safety caveat around the default `0`.
 */
export async function confirmOrAbort(options: ConfirmOrAbortOptions): Promise<void> {
  const ok = await confirm({
    message: options.message,
    initialValue: options.initialValue ?? true,
  });
  if (isCancel(ok) || !ok) {
    cancel(options.abortMessage ?? 'Aborted.');
    process.exit(options.exitCode ?? 0);
  }
}
