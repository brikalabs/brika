import { route } from "@elia/router";
import { LogRouter } from "../../logs/log-router";

export const logsRoutes = [
  route.get("/api/logs", async ({ inject }) => {
    return inject(LogRouter).query();
  }),
];
