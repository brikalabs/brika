/**
 * Hub-side `ctx.ui.*` grant family.
 *
 * Today's only verb is `pickFile`. The picker itself is a hub-app
 * concern — production wires an Electron file dialog or platform
 * equivalent; tests pass a stub. Whatever the picker returns is the
 * host path we register with the EphemeralRoots so the plugin can
 * read it via `/user/<token>/<filename>`.
 */

import type { Grant } from '@brika/grants';
import { defineGrant } from '@brika/grants';
import { uiPickFile as spec, type UiPickFileArgs, type UiPickFileResult } from '@brika/sdk/grants';
import type { EphemeralRoots } from '../fs/ephemeral';

/**
 * Hub-app callback that shows the picker. Returns the absolute host
 * path the user selected, or `null` if they cancelled. Tests pass a
 * stub; production wires the OS native dialog.
 */
export type UiPickerProvider = (args: UiPickFileArgs) => Promise<string | null>;

export interface UiGrantOptions {
  readonly picker: UiPickerProvider;
  readonly ephemeral: EphemeralRoots;
}

export function buildUiGrants(opts: UiGrantOptions): ReadonlyArray<Grant> {
  return [
    defineGrant(spec.spec, async (_ctx, args: UiPickFileArgs): Promise<UiPickFileResult> => {
      const hostPath = await opts.picker(args);
      if (hostPath === null) {
        return { cancelled: true };
      }
      const entry = opts.ephemeral.mint(hostPath);
      return {
        cancelled: false,
        path: entry.virtualPath,
        fileName: entry.fileName,
      };
    }),
  ];
}
