/**
 * Timer Plugin State & Runtime
 *
 * Shared state and API accessible by all tools
 */

import { createPluginRuntime } from "@elia/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Timer Type
// ─────────────────────────────────────────────────────────────────────────────

export interface Timer {
  id: string;
  name: string;
  duration: number;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime
// ─────────────────────────────────────────────────────────────────────────────

const runtime = createPluginRuntime({
  id: "@elia/plugin-timer", // Match package.json name
  version: "0.1.0",
  requires: { sdk: "^0.1.0" },
});

export const { api, start, use, useBlock } = runtime;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

export const timers = new Map<string, Timer>();
let counter = 0;

export function nextId(): number {
  return ++counter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Hooks
// ─────────────────────────────────────────────────────────────────────────────

api.onStop(() => {
  api.log("info", "Timer plugin stopping, clearing all timers");
  for (const t of timers.values()) clearTimeout(t.timeout);
  timers.clear();
});

