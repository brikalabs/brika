import { z } from "zod";
import {
  route,
  group,
  createSSEStream,
  createAsyncSSEStream,
  NotFound,
  BadRequest,
} from "@elia/router";
import { LogRouter } from "../../logs/log-router";
import { EventBus } from "../../events/event-bus";
import { AutomationEngine } from "../../automations";
import { PluginManager } from "../../plugins/plugin-manager";
import type { Json } from "@elia/shared";

const CORS = { "Access-Control-Allow-Origin": "*" };

export const streamsRoutes = [
  // SSE: Stream logs
  route.get("/api/stream/logs", async ({ inject }) => {
    const logs = inject(LogRouter);

    return createSSEStream((send) => {
      const unsub = logs.subscribe((event) => {
        send(event, "log");
      });
      return () => unsub();
    });
  }),

  // SSE: Stream events
  route.get("/api/stream/events", async ({ inject }) => {
    const events = inject(EventBus);

    return createSSEStream((send) => {
      const unsub = events.subscribeAll((event) => {
        send(event, "event");
      });
      return () => unsub();
    });
  }),

  // SSE: Test workflow execution with streaming events
  route.get(
    "/api/workflows/test",
    {
      query: z.object({
        id: z.string(),
        payload: z.string().optional(),
      }),
    },
    async ({ query, inject }) => {
      const automations = inject(AutomationEngine);

      const workflow = automations.get(query.id);
      if (!workflow) throw new NotFound("Workflow not found");

      let payload: Json = {};
      if (query.payload) {
        try {
          payload = JSON.parse(query.payload);
        } catch {
          throw new BadRequest("Invalid payload JSON");
        }
      }

      return createAsyncSSEStream(async (send) => {
        // Emit start
        send({ type: "workflow.start", workflowId: query.id });

        // Get blocks and emit events as they would run
        const blocks = workflow.blocks || [];

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          send({ type: "block.start", blockId: block.id, index: i });

          // Simulate execution delay for visualization
          await new Promise((r) => setTimeout(r, 100));
        }

        // Actually run the workflow
        const run = await automations.trigger(
          query.id,
          "test.trigger",
          "test",
          payload,
        );

        if (run.status === "error") {
          send({ type: "workflow.error", error: run.error });
        } else {
          // Emit completion for each block
          for (const block of blocks) {
            send({ type: "block.complete", blockId: block.id, output: null });
          }
          send({
            type: "workflow.complete",
            runId: run.id,
            duration: (run.finishedAt || Date.now()) - run.startedAt,
          });
        }
      });
    },
  ),

  // Plugin icon endpoint (returns raw file, not JSON)
  route.get(
    "/api/plugins/:id/icon",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      const plugins = inject(PluginManager);
      const pluginId = decodeURIComponent(params.id);
      const pluginDir = plugins.getPluginDir(pluginId);

      if (!pluginDir) throw new NotFound("Plugin not found");

      // Try to find icon file
      const details = plugins.getDetails(pluginId);
      const iconPath = details?.metadata?.icon;

      if (iconPath) {
        const fullPath = iconPath.startsWith("./")
          ? `${pluginDir}/${iconPath.slice(2)}`
          : `${pluginDir}/${iconPath}`;

        const file = Bun.file(fullPath);
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "image/png", ...CORS },
          });
        }
      }

      // Return 204 No Content for missing icons
      return new Response(null, { status: 204, headers: CORS });
    },
  ),
];

