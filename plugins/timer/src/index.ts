/**
 * Timer Plugin for ELIA
 *
 * Provides timer/reminder functionality with fully typed tools using Zod
 */

import { api, start, use } from "./state";

// Re-export all tools - auto-discovered by Hub
export * from "./tools";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registration (uses export * pattern for DX but still needs explicit use())
// ─────────────────────────────────────────────────────────────────────────────

import { set, list, cancel, clear } from "./tools";

use(set);
use(list);
use(cancel);
use(clear);

// ─────────────────────────────────────────────────────────────────────────────
// Event Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

api.on("timer.*", (event) => {
  api.log(
    "debug",
    `Timer event: ${event.type}`,
    event.payload as Record<string, string | number | boolean | null>,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Start Plugin
// ─────────────────────────────────────────────────────────────────────────────

api.log("info", "Timer plugin starting");
await start();
