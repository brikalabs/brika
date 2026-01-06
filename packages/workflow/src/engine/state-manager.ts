/**
 * State Manager (Simplified)
 *
 * No persistence - blocks are stateless flow handlers.
 * This just provides a simple in-memory store for block-level variables.
 */

// Intentionally empty - blocks don't need persistent state in the reactive model.
// If a block needs to track something between events (like debounce timers),
// it uses closures in the setup function.

// This file is kept as a placeholder in case we need block-local state later.
