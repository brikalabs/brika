# @brika/cli

Small CLI framework used by the Brika tools (`brika`, `create-brika`, internal scripts). Provides argument parsing, subcommand routing, and pretty `--help` output without pulling in a dependency tree the size of Commander.

## Usage

```ts
import { createCli, defineCommand } from '@brika/cli';

const start = defineCommand({
  name: 'start',
  description: 'Start the hub in the background',
  async handler({ positionals }) {
    await startHub(positionals);
  },
});

const logs = defineCommand({
  name: 'logs',
  description: 'Tail hub logs',
  options: { follow: { type: 'boolean', short: 'f' } },
  async handler({ values }) {
    await tailLogs({ follow: values.follow });
  },
});

await createCli({ name: 'brika', defaultCommand: 'start' })
  .addCommand(start)
  .addCommand(logs)
  .addHelp()
  .run();
```

## Why not Commander/yargs

Both bring large dependency trees and runtime weight that the Brika CLIs don't need. This wrapper is a few hundred lines around `Bun.argv` parsing and a typed command dispatcher — enough for our use, easy to read.
