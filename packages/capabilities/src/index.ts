/**
 * @brika/capabilities — the capability registry primitive.
 *
 * See `apps/docs/architecture/sandbox-roadmap.md` for the design rationale.
 *
 * Plugin authors do not import from this package directly. They use the
 * typed `ctx` vended by `@brika/sdk`. Hub code uses the registry; plugin
 * SDK code uses the vector and a typed ctx-builder.
 */

export { defineCapability } from './define';
export {
  CapabilityError,
  CapabilityRegistry,
  type ManifestCapabilities,
  type ManifestCapabilityRequest,
  type UserGrants,
} from './registry';
export type {
  Capability,
  CapabilityGrant,
  CapabilityHandler,
  CapabilityHandlerContext,
  CapabilityId,
  CapabilitySpec,
  CapabilityVector,
  PermissionGate,
} from './types';
