import { z } from "zod";
import { route, group, NotFound } from "@elia/router";
import { PluginManager } from "../../plugins/plugin-manager";

export const pluginsRoutes = group("/api/plugins", [
  // List all plugins
  route.get("/", async ({ inject }) => {
    return inject(PluginManager).list();
  }),

  // Load a new plugin by ref
  route.post("/load", { body: z.object({ ref: z.string() }) }, async ({ body, inject }) => {
    await inject(PluginManager).load(body.ref);
    return { ok: true };
  }),

  // Get plugin details by uid
  route.get("/:uid", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const plugin = inject(PluginManager).get(params.uid);
    if (!plugin) throw new NotFound("Plugin not found");
    return plugin;
  }),

  // Plugin icon endpoint
  route.get("/:uid/icon", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const plugin = inject(PluginManager).get(params.uid);
    if (!plugin) throw new NotFound("Plugin not found");

    if (!plugin.icon) {
      return new Response(null, { status: 204 });
    }

    const file = Bun.file(Bun.resolveSync(plugin.icon, plugin.dir));
    if (await file.exists()) {
      const content = await file.arrayBuffer();
      return new Response(content, {
        headers: {
          "Content-Type": file.type || "image/png",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    return new Response(null, { status: 204 });
  }),

  // Enable plugin by uid
  route.post("/:uid/enable", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    await inject(PluginManager).enable(params.uid);
    return { ok: true };
  }),

  // Disable plugin by uid
  route.post("/:uid/disable", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    await inject(PluginManager).disable(params.uid);
    return { ok: true };
  }),

  // Reload plugin by uid
  route.post("/:uid/reload", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    await inject(PluginManager).reload(params.uid);
    return { ok: true };
  }),

  // Kill plugin by uid
  route.post("/:uid/kill", { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    await inject(PluginManager).kill(params.uid);
    return { ok: true };
  }),
]);
