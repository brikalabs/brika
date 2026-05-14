# @brika/cli

Small CLI framework used by the Brika tools (`brika`, `create-brika`, internal scripts). Provides argument parsing, subcommand routing, and pretty `--help` output without pulling in a dependency tree the size of Commander.

## Usage

```ts
import { defineCli } from '@brika/cli';

const cli = defineCli({
  name: 'brika',
  commands: {
    start: {
      summary: 'Start the hub in the background',
      run: async ({ args }) => {
        await startHub(args);
      },
    },
    logs: {
      summary: 'Tail hub logs',
      flags: { follow: { type: 'boolean', alias: 'f' } },
      run: async ({ flags }) => {
        await tailLogs({ follow: flags.follow });
      },
    },
  },
});

await cli.run(process.argv.slice(2));
```

## Why not Commander/yargs

Both bring large dependency trees and runtime weight that the Brika CLIs don't need. This wrapper is a few hundred lines around `Bun.argv` parsing and a typed command dispatcher — enough for our use, easy to read.
