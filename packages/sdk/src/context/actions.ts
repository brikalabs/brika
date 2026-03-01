/**
 * Actions Module
 *
 * Handles plugin action registration and invocation.
 * Self-registers with the context module system.
 */

import {
  callAction as callActionMsg,
  registerAction as registerActionMsg,
} from '@brika/ipc/contract';
import { type ContextCore, registerContextModule } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionHandler = (input?: unknown) => unknown;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupActions(core: ContextCore) {
  const { client } = core;
  const handlers = new Map<string, ActionHandler>();

  client.implement(callActionMsg, async ({ actionId, input }) => {
    const handler = handlers.get(actionId);
    if (!handler) {
      return {
        ok: false,
        error: `Action "${actionId}" not found`,
      };
    }
    try {
      const data = await handler(input);
      return {
        ok: true,
        data: data as typeof input,
      };
    } catch (e) {
      return {
        ok: false,
        error: String(e),
      };
    }
  });

  return {
    methods: {
      registerAction(id: string, handler: ActionHandler): void {
        handlers.set(id, handler);
        client.send(registerActionMsg, {
          id,
        });
      },
    },
  };
}

registerContextModule('actions', setupActions);
