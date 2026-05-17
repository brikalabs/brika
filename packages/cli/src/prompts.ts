/**
 * Brika prompts — thin pass-through over @clack/prompts.
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
 *   const ok = await p.confirm({ message: 'Continue?' });
 *   if (p.isCancel(ok) || !ok) return;
 */

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
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
