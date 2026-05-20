/**
 * Capability-flow integration fixture.
 *
 * Spawned by `capability-flow.test.ts` with the hub prelude loaded.
 * Drives scenarios via fire-and-forget messages (NOT channel.implement RPCs),
 * because the prelude's drain queue serialises every inbound message: a
 * `channel.implement` handler that awaits another `channel.call` deadlocks
 * — the response is queued but can't be drained until the handler returns,
 * and the handler can't return until the response arrives.
 *
 *   plugin ctx Proxy -> capabilityRequest RPC -> harness handler ->
 *   harness response -> plugin Promise resolves -> reported via fire-and-forget
 */

import type { Channel } from '@brika/ipc';
import { buildCtx, readInjectedVector } from '@brika/sdk/ctx';

interface Prelude {
  channel: Channel;
  start(): void | Promise<void>;
  [key: string]: unknown;
}

const prelude = (globalThis as Record<string, unknown>).__brika_ipc as Prelude | undefined;
if (!prelude) {
  console.error('Prelude bridge not found');
  process.exit(1);
}

const channel = prelude.channel;

type CtxShape = {
  location: { timezone: (args?: Record<string, never>) => Promise<{ timezone: string | null }> };
  notgranted: { thing: (args?: Record<string, never>) => Promise<unknown> };
};

let ctx: CtxShape | undefined;

// Scenario dispatcher — listens for fire-and-forget `runScenario` messages
// from the test, executes the chosen scenario against ctx, reports back via
// fire-and-forget. Bypasses the channel's drain queue entirely.
process.on('message', async (raw) => {
  const msg = raw as { t: string; runId?: number };
  if (msg.t !== 'runScenario' || !ctx) {
    return;
  }
  const runId = msg.runId ?? 0;
  const scenario = (msg as { scenario?: string }).scenario;
  try {
    if (scenario === 'locationTimezone') {
      const res = await ctx.location.timezone();
      process.send?.({ t: 'scenarioResult', runId, ok: true, value: res });
    } else if (scenario === 'missingCapability') {
      try {
        await ctx.notgranted.thing();
        process.send?.({
          t: 'scenarioResult',
          runId,
          ok: true,
          deniedAtBoundary: false,
        });
      } catch (e) {
        process.send?.({
          t: 'scenarioResult',
          runId,
          ok: true,
          deniedAtBoundary: true,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      process.send?.({
        t: 'scenarioResult',
        runId,
        ok: false,
        error: `unknown scenario "${scenario}"`,
      });
    }
  } catch (e) {
    process.send?.({
      t: 'scenarioResult',
      runId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// Kick off the prelude startup so it fetches the vector via the harness.
// Once it resolves, build the ctx and tell the harness we're ready.
try {
  await prelude.start();
  const vector = readInjectedVector();
  ctx = buildCtx(vector, channel) as unknown as CtxShape;
  process.send?.({ t: 'ctxReady' });
} catch (e) {
  process.send?.({ t: 'ctxReady', error: String(e) });
}
