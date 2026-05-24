/**
 * `ctx.ui.*` — user-facing UI grants.
 *
 * The hub displays a file picker (or other UX) on the plugin's
 * behalf; the user makes a choice; the hub mints a short-lived
 * `/user/<token>` virtual path that the plugin can read via the
 * normal `ctx.fs.readFile` etc. machinery.
 *
 * `ctx.ui.pickFile` is the security-critical entry point: tokens are
 * minted ONLY by the hub in response to a user's explicit action.
 * A malicious plugin can't forge a token, and can't trick the user
 * into picking a file they didn't intend to (the picker UI is
 * hub-owned).
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';

// ─── Scope ──────────────────────────────────────────────────────────────────

export const UiScopeSchema = z.object({
  /**
   * Allowed `accept` filters the plugin may request when opening a
   * picker. Patterns are MIME-type strings (`image/*`, `text/plain`)
   * or `.ext` lists. Operators can leave this empty to allow any
   * filter.
   */
  acceptFilters: z.array(z.string()).default([]),
});

export type UiScope = z.infer<typeof UiScopeSchema>;

const UiPermission: PermissionGate<typeof UiScopeSchema> = {
  name: 'ui',
  scope: UiScopeSchema,
  defaultScope: { acceptFilters: [] },
  icon: 'image',
};

// ─── pickFile ───────────────────────────────────────────────────────────────

export const UiPickFileArgsSchema = z.object({
  /** MIME-type or `.ext` filter list, mirrors HTML `accept`. */
  accept: z.string().optional(),
  /** Window title for the picker. */
  title: z.string().max(120).optional(),
});

export const UiPickFileResultSchema = z.discriminatedUnion('cancelled', [
  z.object({
    cancelled: z.literal(false),
    /** Virtual path the plugin can immediately feed to ctx.fs.readFile. */
    path: z.string(),
    /** Basename of the picked file. */
    fileName: z.string(),
  }),
  z.object({ cancelled: z.literal(true) }),
]);

export type UiPickFileArgs = z.infer<typeof UiPickFileArgsSchema>;
export type UiPickFileResult = z.infer<typeof UiPickFileResultSchema>;

export const uiPickFile = defineGrant(
  {
    id: 'dev.brika.ui.pickFile',
    args: UiPickFileArgsSchema,
    result: UiPickFileResultSchema,
    permission: UiPermission,
    description: 'Open the hub-provided file picker and return a one-shot virtual path.',
    redact: {
      result: (result) =>
        result.cancelled === true
          ? { cancelled: true }
          : { cancelled: false, fileName: result.fileName },
    },
  },
  () => {
    throw new Error('ui.pickFile: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── ctx augmentation ───────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    ui: {
      pickFile(args: UiPickFileArgs): Promise<UiPickFileResult>;
    };
  }
}
