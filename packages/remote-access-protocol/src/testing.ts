/**
 * Test-only utilities for `@brika/remote-access-protocol`, imported by
 * downstream tests via the `/testing` subpath export so they never reach
 * production bundles.
 */

export { createInMemoryClaimStore } from './in-memory-claim-store';
