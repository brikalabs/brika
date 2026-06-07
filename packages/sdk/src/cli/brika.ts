/**
 * The `brika` author CLI, shipped inside @brika/sdk so a plugin needs only the
 * single @brika/sdk dependency to run create/build/check/verify in its scripts
 * and CI. Packed to dist/bin/brika.js by `build:bin` (the build toolchain is a
 * devDependency, inlined at build, so it never enters a plugin's install
 * closure). dev/install need a running hub and live in the full Brika app; here
 * they are clear stubs.
 */

import { createCli, defineCommand } from '@brika/cli';
import pc from 'picocolors';
import build from './commands/build';
import check from './commands/check';
import verify from './commands/verify';

/** A placeholder for a verb that needs the full Brika hub the lean CLI can't start. */
function hubStub(name: string, hint: string) {
  return defineCommand({
    name,
    description: `${name}: needs the full Brika app`,
    options: {},
    handler() {
      process.stderr.write(
        `${pc.yellow(`brika ${name}`)} needs a running Brika hub, which this CLI can't start.\n  ${pc.dim(hint)}\n`
      );
      process.exitCode = 1;
    },
  });
}

await createCli({ name: 'brika' })
  .addCommand(build)
  .addCommand(check)
  .addCommand(verify)
  .addCommand(hubStub('dev', 'Install the Brika app for a managed hub, then run `brika dev`.'))
  .addCommand(hubStub('install', 'Install the Brika app, then run `brika install`.'))
  .addHelp()
  .run();
