/**
 * The `brika` author CLI, shipped inside @brika/sdk so a plugin needs only the
 * single @brika/sdk dependency to run create/build/check/verify in its scripts
 * and CI. Packed to dist/bin/brika.js by `build:bin` (the build toolchain is a
 * devDependency, inlined at build, so it never enters a plugin's install
 * closure). `dev` and `install` drive an ALREADY-running hub over loopback;
 * starting a hub needs the full Brika app.
 */

import { createCli } from '@brika/cli';
import build from './commands/build';
import check from './commands/check';
import dev from './commands/dev';
import install from './commands/install';
import verify from './commands/verify';

await createCli({ name: 'brika' })
  .addCommand(build)
  .addCommand(check)
  .addCommand(verify)
  .addCommand(dev)
  .addCommand(install)
  .addHelp()
  .run();
