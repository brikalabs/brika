/**
 * Marker class — thrown by command handlers when the failure is
 * a normal user-facing error (missing dependency, bad flag, hub
 * not running). The CLI runtime catches these, prints the message,
 * and exits with code 1.
 */
export class CliError extends Error {}
