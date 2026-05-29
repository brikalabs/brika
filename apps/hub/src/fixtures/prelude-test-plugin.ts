/**
 * Minimal plugin fixture for prelude integration tests.
 *
 * Uses the prelude's Channel (exposed via globalThis.__brika_ipc)
 * to implement test-only RPCs.
 *
 *   - "getTZ"  (RPC)     -> replies with current process.env.TZ
 *   - "stop"   (message)  -> handled by prelude, exits cleanly
 */

import type { Channel } from '@brika/ipc';
import { rpc } from '@brika/ipc';
import { z } from 'zod';

const getTZ = rpc('getTZ', z.object({}), z.object({ tz: z.string().nullable() }));

const prelude = (globalThis as Record<string, unknown>).__brika_ipc as
  | ({ channel: Channel } & Record<string, unknown>)
  | undefined;
if (!prelude) {
  console.error('Prelude bridge not found');
  process.exit(1);
}

prelude.channel.implement(getTZ, () => ({
  tz: process.env.TZ ?? null,
}));
