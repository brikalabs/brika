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
import { BrikaError, rpc } from '@brika/ipc';
import { buildCtx, readInjectedVector } from '@brika/sdk/ctx';
import { z } from 'zod';

// Test-only RPC: the harness calls this on the plugin, the handler awaits
// a nested ctx capability call, and the result rides back in the response.
// Used to verify the prelude's drain queue can deliver an RPC response
// while another handler is awaiting a different one (the deadlock fix).
const nestedTimezoneRpc = rpc(
  'nestedTimezone',
  z.object({}),
  z.object({
    ok: z.boolean(),
    timezone: z.string().nullable().optional(),
    errorMessage: z.string().optional(),
  })
);

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

/** Flatten an error cause to a string for the scenario-result envelope. */
function describeCause(cause: unknown): string | undefined {
  if (cause === undefined) {
    return undefined;
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return JSON.stringify(cause);
}

type ScenarioResult = Record<string, unknown>;
type Scenario = (ctx: CtxShape) => Promise<ScenarioResult>;

async function runLocationTimezone(c: CtxShape): Promise<ScenarioResult> {
  const value = await c.location.timezone();
  return { ok: true, value };
}

async function runInspectRemoteError(c: CtxShape): Promise<ScenarioResult> {
  try {
    await c.location.timezone();
    return { ok: false, error: 'expected throw' };
  } catch (e) {
    const err = e as Error & { code?: string; cause?: unknown };
    return {
      ok: true,
      name: err.name,
      code: err.code,
      message: err.message,
      causeMessage: describeCause(err.cause),
      stackContainsRemote: err.stack?.includes('--- remote stack ---') ?? false,
    };
  }
}

async function runInspectTypedError(c: CtxShape): Promise<ScenarioResult> {
  try {
    await c.location.timezone();
    return { ok: false, error: 'expected throw' };
  } catch (e) {
    if (BrikaError.is(e, 'NET_HOST_NOT_ALLOWED')) {
      return {
        ok: true,
        narrowed: true,
        code: e.code,
        host: e.data?.host,
        allow: e.data?.allow,
      };
    }
    return {
      ok: true,
      narrowed: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runMissingCapability(c: CtxShape): Promise<ScenarioResult> {
  try {
    await c.notgranted.thing();
    return { ok: true, deniedAtBoundary: false };
  } catch (e) {
    return {
      ok: true,
      deniedAtBoundary: true,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

const SCENARIOS: Record<string, Scenario> = {
  locationTimezone: runLocationTimezone,
  inspectRemoteError: runInspectRemoteError,
  inspectTypedError: runInspectTypedError,
  missingCapability: runMissingCapability,
};

// Scenario dispatcher — listens for fire-and-forget `runScenario` messages
// from the test, executes the chosen scenario against ctx, reports back via
// fire-and-forget. Bypasses the channel's drain queue entirely.
process.on('message', async (raw) => {
  const msg = raw as { t: string; runId?: number; scenario?: string };
  if (msg.t !== 'runScenario' || !ctx) {
    return;
  }
  const runId = msg.runId ?? 0;
  const scenario = msg.scenario;
  const handler = scenario === undefined ? undefined : SCENARIOS[scenario];
  if (!handler) {
    process.send?.({
      t: 'scenarioResult',
      runId,
      ok: false,
      error: `unknown scenario "${scenario}"`,
    });
    return;
  }
  try {
    const result = await handler(ctx);
    process.send?.({ t: 'scenarioResult', runId, ...result });
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

  // Now register the nested-RPC handler. Before the drain-queue fix this
  // path deadlocked: the inbound `nestedTimezone` RPC would block the drain
  // while it awaited the nested `ctx.location.timezone()` response, and
  // the response could never be drained.
  channel.implement(nestedTimezoneRpc, async () => {
    if (!ctx) {
      return { ok: false, errorMessage: 'ctx not built' };
    }
    try {
      const res = await ctx.location.timezone();
      return { ok: true, timezone: res.timezone ?? null };
    } catch (e) {
      return { ok: false, errorMessage: e instanceof Error ? e.message : String(e) };
    }
  });

  process.send?.({ t: 'ctxReady' });
} catch (e) {
  process.send?.({ t: 'ctxReady', error: String(e) });
}
