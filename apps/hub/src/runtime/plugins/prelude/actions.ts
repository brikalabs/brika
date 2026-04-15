/**
 * Prelude Actions Module
 *
 * Action handler registry and callAction RPC implementation.
 */

import type { Channel, Json } from '@brika/ipc';
import {
  callAction as callActionRpc,
  registerAction as registerActionMsg,
} from '@brika/ipc/contract';

type ActionHandler = (input?: Json) => Json | Promise<Json>;

export function setupActions(channel: Channel) {
  const handlers = new Map<string, ActionHandler>();

  channel.implement(callActionRpc, async ({ actionId, input }) => {
    const handler = handlers.get(actionId);
    if (!handler) {
      return { ok: false, error: `Action "${actionId}" not found` };
    }
    try {
      const data = await handler(input);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  return {
    registerAction(id: string, handler: ActionHandler): void {
      handlers.set(id, handler);
      channel.send(registerActionMsg, { id });
    },
  };
}
