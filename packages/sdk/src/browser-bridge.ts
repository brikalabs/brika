/**
 * Browser bridge contract (`@brika/sdk/browser-bridge`). The map itself lives
 * in `@brika/schema/browser-bridge` (the leaf package) so the compiler reads
 * it without depending on the SDK; this re-export keeps the SDK-side import
 * path the host UI and plugins use.
 */

export { BRIDGE_GLOBALS, type BridgeProp } from '@brika/schema/browser-bridge';
