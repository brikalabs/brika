/**
 * Shared "send one grant call, re-parse the result" helper for every
 * proxy in this directory.
 *
 * Every proxy (fetch, dns.*, fs runtime methods) does the same thing
 * over IPC: build args, call `channel.call(grantRequest, {id, args})`,
 * re-parse the `unknown` result through the grant's own schema. This
 * keeps the parse in one place so a future change (e.g. attaching the
 * plugin AbortSignal once Channel.call supports it) lands once instead
 * of N times.
 */

import type { Channel } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';

export async function callGrant<R>(
  channel: Channel,
  id: string,
  args: unknown,
  parse: (raw: unknown) => R
): Promise<R> {
  const response = await channel.call(grantRequest, { id, args });
  return parse(response.result);
}
