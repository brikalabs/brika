import { combineRoutes } from "@elia/router";

import { healthRoutes } from "./health";
import { toolsRoutes } from "./tools";
import { blocksRoutes } from "./blocks";
import { pluginsRoutes } from "./plugins";
import { storeRoutes } from "./store";
import { eventsRoutes } from "./events";
import { schedulesRoutes } from "./schedules";
import { rulesRoutes } from "./rules";
import { workflowsRoutes } from "./workflows";
import { logsRoutes } from "./logs";
import { streamsRoutes } from "./streams";

/**
 * All API routes combined.
 *
 * @example
 * ```ts
 * // Add a version prefix to all routes:
 * export const allRoutes = combineRoutes(
 *   { prefix: "/v1" },
 *   healthRoutes,
 *   toolsRoutes,
 *   // ...
 * );
 * ```
 */
export const allRoutes = combineRoutes(
  healthRoutes,
  toolsRoutes,
  blocksRoutes,
  pluginsRoutes,
  storeRoutes,
  eventsRoutes,
  schedulesRoutes,
  rulesRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
);
