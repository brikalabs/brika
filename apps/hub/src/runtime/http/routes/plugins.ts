import { z } from "zod";
import { route, group, NotFound } from "@elia/router";
import { PluginManager } from "../../plugins/plugin-manager";

export const pluginsRoutes = group("/api/plugins", [
  route.get("/", async ({ inject }) => {
    return inject(PluginManager).list();
  }),

  route.post(
    "/enable",
    { body: z.object({ ref: z.string() }) },
    async ({ body, inject }) => {
      await inject(PluginManager).enable(body.ref);
      return { ok: true };
    },
  ),

  route.post(
    "/disable",
    { body: z.object({ ref: z.string() }) },
    async ({ body, inject }) => {
      await inject(PluginManager).disable(body.ref);
      return { ok: true };
    },
  ),

  route.post(
    "/reload",
    { body: z.object({ ref: z.string() }) },
    async ({ body, inject }) => {
      await inject(PluginManager).reload(body.ref);
      return { ok: true };
    },
  ),

  route.post(
    "/kill",
    { body: z.object({ ref: z.string() }) },
    async ({ body, inject }) => {
      await inject(PluginManager).kill(body.ref);
      return { ok: true };
    },
  ),

  route.get(
    "/:id",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      const plugins = inject(PluginManager);
      const details = plugins.getDetails(decodeURIComponent(params.id));
      if (!details) throw new NotFound("Plugin not found");
      return details;
    },
  ),

  // Note: Plugin icon endpoint returns raw file, handled separately in streams.ts
]);

