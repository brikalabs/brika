/**
 * Timer List Tool
 */

import { defineTool, z } from "@elia/sdk";
import { timers } from "../state";

export const list = defineTool({
  id: "list",
  description: "List all active timers with remaining time",
  schema: z.object({}),
}, async () => {
  const now = Date.now();
  const active = Array.from(timers.values()).map((t) => ({
    id: t.id,
    name: t.name,
    remaining: Math.max(0, Math.round((t.startedAt + t.duration - now) / 1000)),
    duration: t.duration / 1000,
  }));

  return {
    ok: true,
    content: active.length === 0 ? "No active timers" : `${active.length} active timer(s)`,
    data: active,
  };
});

