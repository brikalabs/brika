/**
 * Echo Plugin - Simple example with type-safe Zod tools
 */

import { createPluginRuntime, defineTool, z } from "@elia/sdk";

const { api, start, use } = createPluginRuntime({
  id: "@elia/plugin-example-echo", // Match package.json name
  version: "0.1.0",
  requires: { sdk: "^0.1.0" },
});

use(defineTool({
  id: "echo",
  description: "Echo back the provided message",
  schema: z.object({
    message: z.string().describe("The message to echo back"),
  }),
}, async (args) => {
  // ✨ args is typed: { message: string }
  api.log("info", "echo", { message: args.message });
  return { ok: true, content: args.message };
}));

api.onStop(() => {
  api.log("info", "stopping");
});

await start();
