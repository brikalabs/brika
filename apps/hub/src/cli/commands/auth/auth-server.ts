/**
 * Re-export @brika/auth/server for auth commands.
 *
 * Tests mock THIS file instead of @brika/auth/server directly,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as authServer from '@brika/auth/server';

export const { auth, UserService } = authServer;
