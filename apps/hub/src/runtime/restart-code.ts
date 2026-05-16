/**
 * Exit code the hub uses to signal the supervisor to restart it.
 * Any other exit code (0, crash, SIGTERM) stops the supervisor loop.
 */
export const RESTART_CODE = 42;
