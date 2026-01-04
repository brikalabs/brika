/**
 * Timer Plugin for ELIA
 *
 * Provides timer/reminder functionality with fully typed tools.
 */

import { defineTool, emit, log, on, onStop, z } from "@elia/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Timer State
// ─────────────────────────────────────────────────────────────────────────────

interface Timer {
  id: string;
  name: string;
  duration: number;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

const timers = new Map<string, Timer>();
let counter = 0;

function nextId(): number {
  return ++counter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────────────────────────────────────

export const set = defineTool(
  {
    id: "set",
    schema: z.object({
      name: z.string().optional().describe("Timer name (auto-generated if not provided)"),
      seconds: z.number().min(1).max(86400).describe("Duration in seconds (1-86400)"),
    }),
  },
  async (args) => {
    const name = args.name ?? `timer-${nextId()}`;
    const { seconds } = args;

    const id = `${Date.now()}-${nextId()}`;
    const duration = seconds * 1000;

    const timeout = setTimeout(() => {
      const timer = timers.get(id);
      if (timer) {
        timers.delete(id);
        log("info", `Timer "${timer.name}" completed`);
        emit("timer.completed", { id, name: timer.name, duration: timer.duration });
      }
    }, duration);

    timers.set(id, { id, name, duration, startedAt: Date.now(), timeout });
    log("info", `Timer "${name}" set for ${seconds}s`, { id });

    return { ok: true, content: `Timer "${name}" set for ${seconds} seconds`, data: { id, name, seconds } };
  },
);

export const list = defineTool(
  {
    id: "list",
    schema: z.object({}),
  },
  async () => {
    const now = Date.now();
    const items = [...timers.values()].map((t) => ({
      id: t.id,
      name: t.name,
      remaining: Math.max(0, t.duration - (now - t.startedAt)),
      duration: t.duration,
    }));
    return { ok: true, content: `${items.length} active timer(s)`, data: items };
  },
);

export const cancel = defineTool(
  {
    id: "cancel",
    schema: z.object({
      target: z.string().describe("Timer ID or name to cancel"),
    }),
  },
  async (args) => {
    // Find by ID first, then by name
    let timer = timers.get(args.target);
    if (!timer) {
      for (const t of timers.values()) {
        if (t.name === args.target) {
          timer = t;
          break;
        }
      }
    }

    if (!timer) {
      return { ok: false, content: `Timer not found: ${args.target}` };
    }

    clearTimeout(timer.timeout);
    timers.delete(timer.id);
    log("info", `Timer "${timer.name}" cancelled`);
    emit("timer.cancelled", { id: timer.id, name: timer.name });

    return { ok: true, content: `Timer "${timer.name}" cancelled` };
  },
);

export const clear = defineTool(
  {
    id: "clear",
    schema: z.object({}),
  },
  async () => {
    const count = timers.size;
    for (const t of timers.values()) {
      clearTimeout(t.timeout);
    }
    timers.clear();
    log("info", `Cleared ${count} timer(s)`);
    return { ok: true, content: `Cleared ${count} timer(s)` };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Event Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

on("timer.*", (event) => {
  log(
    "debug",
    `Timer event: ${event.type}`,
    event.payload as Record<string, string | number | boolean | null>,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

onStop(() => {
  log("info", "Timer plugin stopping, clearing all timers");
  for (const t of timers.values()) clearTimeout(t.timeout);
  timers.clear();
});

log("info", "Timer plugin starting");
