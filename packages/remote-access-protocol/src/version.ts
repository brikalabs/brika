/**
 * Wire-protocol version. Bumped only on breaking changes.
 *
 * Compatibility rules:
 * - Any FE version must talk to any Hub version with the same major `v`.
 * - New fields added in minor revisions MUST be optional and ignored by old peers.
 * - Removing or repurposing a field requires a major bump.
 *
 * Capability flags in the {@link HelloMessage} let peers negotiate features
 * added between major bumps without breaking older clients.
 */
export const PROTOCOL_VERSION = 2 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;
