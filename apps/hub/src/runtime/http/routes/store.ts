import { z } from "zod";
import { route, group } from "@elia/router";
import { StoreService } from "../../store/store-service";

export const storeRoutes = group("/api/store", [
  route.post(
    "/install",
    {
      body: z.object({
        ref: z.string(),
        wanted: z.string().optional(),
      }),
    },
    async ({ body, inject }) => {
      await inject(StoreService).install(body.ref, body.wanted);
      return { ok: true };
    },
  ),

  route.post("/uninstall", { body: z.object({ ref: z.string() }) }, async ({ body, inject }) => {
    await inject(StoreService).uninstall(body.ref);
    return { ok: true };
  }),
]);
