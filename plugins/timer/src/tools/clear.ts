/**
 * Timer Clear Tool
 */

import { defineTool, z } from "@elia/sdk";
import { timers, api } from "../state";

export const clear = defineTool(
  {
    id: "clear",
    description: "Clear all active timers at once",
    schema: z.object({}),
  },
  async () => {
    const count = timers.size;
    for (const t of timers.values()) clearTimeout(t.timeout);
    timers.clear();
    api.log("info", `Cleared ${count} timer(s)`);
    return { ok: true, content: `Cleared ${count} timer(s)` };
  },
);

