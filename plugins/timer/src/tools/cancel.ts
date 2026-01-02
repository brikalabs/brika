/**
 * Timer Cancel Tool
 */

import { defineTool, z } from "@elia/sdk";
import { timers, api } from "../state";

export const cancel = defineTool(
  {
    id: "cancel",
    description: "Cancel an active timer by ID or name",
    schema: z.object({
      id: z.string().optional().describe("Timer ID to cancel"),
      name: z.string().optional().describe("Timer name to cancel (if ID not provided)"),
    }),
  },
  async (args) => {
    const { id, name } = args;

    if (!id && !name) return { ok: false, content: "Provide id or name to cancel" };

    let found: ReturnType<typeof timers.get>;
    if (id) {
      found = timers.get(id);
    } else if (name) {
      for (const t of timers.values()) {
        if (t.name === name) {
          found = t;
          break;
        }
      }
    }

    if (!found) return { ok: false, content: "Timer not found" };

    clearTimeout(found.timeout);
    timers.delete(found.id);
    api.log("info", `Timer "${found.name}" cancelled`, { id: found.id });
    api.emit("timer.cancelled", { id: found.id, name: found.name });

    return { ok: true, content: `Timer "${found.name}" cancelled` };
  },
);

