/**
 * Re-export hub-client utilities for auth commands.
 *
 * Tests mock THIS file instead of @/cli/utils/hub-client directly,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as hubClient from '../../utils/hub-client';

export const { hubFetchOk } = hubClient;
