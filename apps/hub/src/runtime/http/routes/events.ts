import { z } from "zod";
import { route, group } from "@elia/router";
import type { Json } from "@elia/shared";
import { EventBus } from "../../events/event-bus";

export const eventsRoutes = group("/api/events", [
  route.get("/", async ({ inject }) => {
    return inject(EventBus).query();
  }),

  route.post(
    "/",
    {
      body: z.object({
        type: z.string(),
        payload: z.unknown().optional(),
      }),
    },
    async ({ body, inject }) => {
      return inject(EventBus).emit(body.type, "api", (body.payload ?? null) as Json);
    },
  ),
]);
