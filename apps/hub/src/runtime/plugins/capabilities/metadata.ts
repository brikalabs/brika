/**
 * Capability metadata exposed to the UI.
 *
 * Builds per-capability rows from the SDK's `BUILTIN_CAPABILITIES` list plus
 * the plugin's manifest requests and the user's grants. Used by:
 *
 *   - `GET /api/plugins/:name/capabilities` (post-install settings UI)
 *   - `GET /api/plugins/preview` (install-time consent UI)
 *
 * Each row carries everything the FE needs to render an editor: the spec's
 * user-facing `title`, `description`, the requested + granted scopes, the
 * `ui` hint, and the per-permission icon.
 */

import type { Capability, ScopeEditorHint } from '@brika/capabilities';
import { resolveCtxPath } from '@brika/capabilities';
import { BUILTIN_CAPABILITIES } from '@brika/sdk/capabilities';

export interface CapabilityMetadata {
  readonly id: string;
  readonly ctxPath: string;
  readonly title: string;
  readonly description: string | null;
  readonly family: string | null;
  readonly icon: string | null;
  readonly requestedScope: unknown;
  readonly grantedScope: unknown | null;
  readonly ui: ScopeEditorHint;
}

const NONE_HINT: ScopeEditorHint = { kind: 'none' };

function specsById(): Map<string, Capability> {
  const out = new Map<string, Capability>();
  for (const cap of BUILTIN_CAPABILITIES) {
    out.set(cap.spec.id, cap);
  }
  return out;
}

/**
 * Build the row list for a plugin's capability manifest. Manifest order is
 * preserved so the UI renders rows in the order the plugin author declared.
 *
 * Capabilities not registered with the hub are dropped — they would never
 * resolve at dispatch time anyway, so showing a granted toggle for them
 * would be misleading.
 */
export function buildCapabilityMetadata(
  manifestCaps: Readonly<Record<string, unknown>>,
  userGrants: Readonly<Record<string, unknown>>
): CapabilityMetadata[] {
  const registered = specsById();
  const rows: CapabilityMetadata[] = [];

  for (const [id, requestedScope] of Object.entries(manifestCaps)) {
    const cap = registered.get(id);
    if (!cap) {
      continue;
    }
    const { spec } = cap;
    const perm = spec.permission;
    const grantedScope = Object.hasOwn(userGrants, id) ? userGrants[id] : null;

    rows.push({
      id,
      ctxPath: resolveCtxPath(spec),
      title: spec.title,
      description: spec.description ?? null,
      family: perm?.name ?? null,
      icon: perm?.icon ?? null,
      requestedScope,
      grantedScope,
      ui: perm?.ui ?? NONE_HINT,
    });
  }

  return rows;
}

/**
 * Validate a scope value against the spec's Zod schema. Returns the parsed
 * scope on success, or a list of human-readable issue strings on failure.
 */
export function validateScopeForCapability(
  capId: string,
  scope: unknown
):
  | { readonly ok: true; readonly scope: unknown }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const cap = specsById().get(capId);
  if (!cap) {
    return { ok: false, issues: [`Unknown capability "${capId}".`] };
  }
  const perm = cap.spec.permission;
  if (!perm) {
    return { ok: false, issues: [`Capability "${capId}" is always-on (no scope).`] };
  }
  const parsed = perm.scope.safeParse(scope);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.length > 0 ? i.path.join('.') : '<root>'}: ${i.message}`
      ),
    };
  }
  return { ok: true, scope: parsed.data };
}
