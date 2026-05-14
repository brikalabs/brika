/**
 * Filesystem layout the CLI needs to interact with the running hub.
 *
 * The CLI deliberately does NOT import `@/runtime/context/brika-context`
 * (that lives inside the hub binary and pulls in the full runtime).
 * Instead we resolve the same convention here so the CLI stays lean:
 *
 *   - `$BRIKA_HOME` if set
 *   - else compiled mode: parent of the install directory
 *   - else dev mode: `<cwd>/.brika`
 *
 * Keep this in sync with `apps/hub/src/runtime/context/brika-context.ts`.
 */

import { dirname, join } from 'node:path';

const isCompiled = import.meta.path.startsWith('/$bunfs/');
const installDir = dirname(process.execPath);

export function brikaHome(): string {
  const fromEnv = process.env.BRIKA_HOME;
  if (fromEnv) {
    return fromEnv;
  }
  return isCompiled ? dirname(installDir) : join(process.cwd(), '.brika');
}

export function pidFile(): string {
  return join(brikaHome(), 'brika.pid');
}
