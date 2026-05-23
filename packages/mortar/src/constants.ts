/**
 * Centralized magic numbers. Anything tunable lives here so we don't
 * sprinkle bare integers through the code. Each export is documented
 * with what it controls and the reasoning for the chosen value.
 */

/** Per-service log buffer cap (oldest lines drop when exceeded). */
export const RING_BUFFER_LINES = 10_000;

/**
 * Grace period between SIGTERM and SIGKILL during shutdown / restart.
 * Long enough that vite / bun / etc. can flush; short enough that an
 * uncooperative child doesn't leave the user waiting on Ctrl+C.
 */
export const SHUTDOWN_GRACE_MS = 3_000;

/**
 * Hold the "all stopped" frame for this long before unmounting ink, so
 * the user actually sees every service flip to ✓. Without it, the
 * `shutdown` event fires synchronously after the kill promises resolve
 * and ink exits before the final render lands.
 */
export const SHUTDOWN_RENDER_HOLD_MS = 400;

/**
 * Default timeout for the `health: auto` port-detection probe. Longer
 * than tcp/http because the child needs to do whatever startup work
 * comes BEFORE binding a port (e.g. vite's transform pipeline warmup).
 */
export const AUTO_HEALTH_TIMEOUT_MS = 30_000;

/** Default timeout for explicit `health: tcp` / `health: http` checks. */
export const EXPLICIT_HEALTH_TIMEOUT_MS = 15_000;

/** Per-poll interval for any healthcheck. */
export const HEALTH_POLL_INTERVAL_MS = 250;

// ─── TUI ────────────────────────────────────────────────────────────────────

/** Lines reserved for chrome (borders, header, footer) — subtracted from rows. */
export const TUI_CHROME_LINES = 9;
/** Lines to scroll on Shift+↑/↓. */
export const TUI_FAST_SCROLL_LINES = 10;
