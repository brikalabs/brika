# Testing

Brika plugins are plain Bun packages. Use `bun test` for unit tests. The SDK ships a small `@brika/sdk/testing` helper for things that touch the SDK context (blocks, sparks, lifecycle).

## Test a block

```ts
import { test, expect } from 'bun:test';
import { runBlock } from '@brika/sdk/testing';
import { greet } from '../src/blocks/greet';

test('emits Hello World on trigger', async () => {
  const { inputs, outputs, stop } = runBlock(greet, { config: { name: 'World' } });

  const messages: string[] = [];
  outputs.message.on((m) => messages.push(m));

  inputs.trigger.push(null);

  expect(messages).toEqual(['Hello, World!']);
  await stop();
});
```

`runBlock(block, { config })` instantiates the block in a test harness:

* `inputs.<port>.push(value)` simulates a value arriving on an input port (analogous to the workflow runtime sending `pushInput`).
* `outputs.<port>` is an `Emitter`-like object you can subscribe to with `.on(fn)`.
* `stop()` runs the block's cleanup.

The harness also runs `onInit`/`onStop` hooks scoped to the block, so timers and cleanup work the same as in production.

## Mock `fetch` with `useBunMock`

The repo ships a `useBunMock` test utility that installs a Bun spy on the global `fetch`. Test files in `apps/hub` follow the `_` prefix convention for shared test utilities:

```ts
import { useBunMock } from './_use-bun-mock';

test('fetches the price', async () => {
  using bun = useBunMock();
  bun.fetch(async () =>
    new Response(JSON.stringify({ bitcoin: { usd: 100000 } }), {
      headers: { 'content-type': 'application/json' },
    })
  );

  await fetchAndEmit();
  // assertions
});
```

The auto-installed spy doesn't need `.apply()` for fetch-only tests; calling `bun.fetch(impl)` again mid-test swaps the implementation. Restoration is handled by the `using` statement.

## Test sparks

Sparks emit and subscribe through the same context. In a test, set up a temporary subscriber:

```ts
import { test, expect } from 'bun:test';
import { subscribeSpark } from '@brika/sdk';
import '../src/sparks';  // triggers defineSpark calls
import { priceUpdate } from '../src/sparks';

test('emits price-update', async () => {
  const events: unknown[] = [];
  const source = subscribeSpark('coingecko:price-update');
  const cleanup = source.start((e) => events.push(e));

  priceUpdate.emit({ symbol: 'btc', usd: 100000, at: Date.now() });
  await new Promise((r) => setTimeout(r, 0));

  expect(events).toHaveLength(1);
  cleanup();
});
```

## Run verify-checks

The plugin verification CLI runs against your manifest and source:

```sh
bunx brika-verify-plugin
```

It catches manifest mismatches, missing files, invalid `engines.brika` ranges, and the rest of the [verify-checks](publishing.md) suite. Wire it as a `prepublishOnly` script in your `package.json` so you can't ship a broken plugin.

## What to test

* Block logic — given a sequence of inputs and a config, the outputs are what you expect.
* Action handlers — given an input, the handler returns the right output (and uses your mocks correctly).
* Edge cases in your data parsing — bad responses, timeouts, malformed input.
* OAuth refresh — the SDK handles it, but if you customise, test the failure path.

What you generally *don't* test: the SDK's own machinery (the reactive stream engine, the IPC channel, the schema validation). Those have their own tests; relying on them is fine.

## See also

* **[Publishing](publishing.md)** — `brika-verify-plugin` and the verify-checks system.
* **[Reactive Blocks](reactive-blocks.md)** — the block lifecycle the testing harness mirrors.
