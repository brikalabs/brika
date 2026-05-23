/**
 * `@brika/grants` — Typed grant registry, the single primitive every plugin
 * uses to call the hub. See `apps/docs/architecture/grants.md` for the
 * design and `apps/docs/architecture/sandbox-roadmap.md` for how the
 * grant primitive fits the tiered isolation plan.
 */

export { defineGrant } from './define';
export type { GrantErrorCode, GrantRegistryOptions } from './registry';
export { GrantError, GrantRegistry, resolveCtxPath } from './registry';
export type {
  AuditEntry,
  AuditLogger,
  Grant,
  GrantEntry,
  GrantHandler,
  GrantHandlerContext,
  GrantId,
  GrantRedaction,
  GrantSpec,
  GrantVector,
  ManifestGrantRequest,
  ManifestGrants,
  PermissionGate,
  UserGrants,
} from './types';
