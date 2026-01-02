/**
 * Timer Set Tool
 */

import { defineTool, z } from "@elia/sdk";
import { timers, api, nextId } from "../state";

export const set = defineTool(
  {
    id: "set",
    description: "Set a timer that fires after the specified duration",
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
        api.log("info", `Timer "${timer.name}" completed`);
        api.emit("timer.completed", { id, name: timer.name, duration: timer.duration });
      }
    }, duration);

    timers.set(id, { id, name, duration, startedAt: Date.now(), timeout });
    api.log("info", `Timer "${name}" set for ${seconds}s`, { id });

    return { ok: true, content: `Timer "${name}" set for ${seconds} seconds`, data: { id, name, seconds } };
  },
);

