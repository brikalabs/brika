/**
 * Default `mortar.yml` content written by `mortar init`. Doubles as
 * documentation — the schema reference at the bottom is the closest
 * thing to a JSON schema we ship.
 *
 * Generic: this isn't the Brika monorepo's bootstrap-dev topology, it's
 * a tiny illustrative example anyone can copy and edit.
 */

export const CONFIG_FILENAME = 'mortar.yml';

export const DEFAULT_CONFIG_YAML = `# mortar — local dev stack definition.
#
# Each service spawns one long-running command. Mortar:
#   - gates startups on \`dependsOn\`
#   - polls a healthcheck before marking the service "healthy"
#   - captures stdout/stderr into a per-service log buffer
#   - tears the whole process tree down on Ctrl+C
#
# This file is a starting point — replace the examples below with your
# stack. Re-run \`mortar\` after editing; config is re-read on every start.
#
# Schema reference at the bottom of this file.

services:
  # Minimal service: label + command. Without an explicit \`port:\`,
  # mortar falls back to a best-effort port detector — fine for most
  # dev tools that print their URL to stdout.
  api:
    label: Example API
    # Single long-running command (commands are argv-split, NOT run in a shell,
    # so '&&', '|' and subshells do not work). Replace with your backend dev
    # command, e.g. 'bun run dev' or 'cargo watch -x run'.
    command: sleep 999999
    port: 3000  # the authoritative answer; used for health + URL

  # Per-service working dir + dep ordering. The \`cwd\` is resolved
  # relative to this file's directory.
  web:
    label: Example Frontend
    cwd: ./
    # Replace with your frontend dev command, e.g. 'npm run dev' or 'vite'.
    command: sleep 999999
    port: 5173
    dependsOn: [api]

# ─── Schema reference ──────────────────────────────────────────────────
#
#   <id>:
#     label:       string — shown in the TUI service list
#     command:     string — argv split on whitespace, "..." / '...' supported
#     cwd:         string — working dir (relative to mortar.yml)
#     env:         { KEY: "value" } — merged on top of process.env
#     dependsOn:   [<id>, ...] — wait for these to be healthy
#     port:        <int>    — TCP port the service listens on. When set,
#                              mortar TCP-probes this port for health and
#                              derives the browser URL from it.
#     health:                 (optional; defaults to TCP-probe of \`port\`,
#                              else heuristic auto-detection)
#       kind:      auto | tcp | http | none
#       port:      <int>    (when kind: tcp)
#       url:       <string> (when kind: http)
#       timeoutMs: <int>    (override default deadline)
#     url:         string — explicit browser URL override (deep link / query)
#
# ─── Variable substitution ─────────────────────────────────────────────
#
# String fields (env values, command, cwd, url) accept two placeholders:
#
#   \${root}     — absolute path to the directory containing this
#                  mortar.yml. Use to pin runtime state to the repo
#                  root even when a service runs from a sub-cwd, e.g.
#                  \`BRIKA_HOME: \${root}/.brika\`.
#   \${env:NAME} — value of process.env.NAME at config load time;
#                  empty string when unset.
#
# Bare \`\${NAME}\` (without the \`env:\` prefix) is left unchanged so it
# can flow through to the spawned service's own runtime.
`;
