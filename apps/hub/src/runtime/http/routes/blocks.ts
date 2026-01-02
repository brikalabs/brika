import { route, group } from "@elia/router";
import { BlockRegistry } from "../../blocks";

export const blocksRoutes = group("/api/blocks", [
  route.get("/", async ({ inject }) => {
    return inject(BlockRegistry).list();
  }),

  route.get("/categories", async ({ inject }) => {
    return inject(BlockRegistry).listByCategory();
  }),
]);
