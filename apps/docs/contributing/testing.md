# Testing

Brika uses Bun's built-in test runner. Test files live next to source as `*.test.ts`. Shared test utilities use a `_` prefix convention (`_use-bun-mock.ts`).

## Running

```sh
bun test                                # everything
bun --filter @brika/sdk test            # one package
bun --filter @brika/hub test            # the hub
bun test --watch                        # watch mode
bun test --coverage                     # coverage report
```

## Conventions

* **Adjacent test files.** `foo.ts` and `foo.test.ts` live in the same directory.
* **One feature per file.** Don't combine unrelated tests in one file just because they share a SUT.
* **`describe` is optional.** Bun's runner supports `test(name, fn)` at the top level.
* **No magic globals.** Import `test`, `expect`, `describe` from `bun:test`.

## Patterns

### `useBunMock` for fetch

```ts
import { useBunMock } from './_use-bun-mock';

test('fetches the price', async () => {
  using bun = useBunMock();
  bun.fetch(async () =>
    new Response(JSON.stringify({ usd: 100000 }), {
      headers: { 'content-type': 'application/json' },
    })
  );

  const result = await fetchPrice('bitcoin');
  expect(result.usd).toBe(100000);
});
```

`bun.fetch(impl)` auto-installs a spy on the global `fetch` on first call — no `.apply()` needed for fetch-only tests. Calling `bun.fetch(impl)` again mid-test swaps the implementation. The `using` statement restores the original `fetch` at the end of the test.

### Reactive block harness

```ts
import { runBlock } from '@brika/sdk/testing';
import { timer } from '../src/blocks/timer';

test('emits after duration', async () => {
  const { inputs, outputs, stop } = runBlock(timer, {
    config: { duration: 100 },
  });

  const completed: unknown[] = [];
  outputs.completed.on((c) => completed.push(c));

  inputs.trigger.push(null);
  await new Promise((r) => setTimeout(r, 150));

  expect(completed).toHaveLength(1);
  await stop();
});
```

The harness instantiates the block with the same cleanup semantics as production — `stop()` runs every registered cleanup.

### Database tests against a real DB

**Integration tests must hit a real database, not mocks.** The pattern:

```ts
import { Database } from 'bun:sqlite';

test('migration applies', async () => {
  const db = new Database(':memory:');
  await applyMigrations(db);
  // assertions
  db.close();
});
```

Use `:memory:` SQLite for speed. The hub's own tests do this throughout.

### Time

For tests that need to advance time without `setTimeout`, the SDK's testing helpers expose a controllable clock that operators (`debounce`, `throttle`, `delay`) honour:

```ts
const { advance } = useFakeTime();
input.push('a');
advance(100);
// `debounce(100)` will emit now
```

### Snapshot tests

Bun supports snapshot tests via `expect(...).toMatchSnapshot()`. Use sparingly — they're good for stable output (HTML, generated JSON Schema), bad for evolving structures.

## Architecture tests

`@brika/archunit` lets us encode architecture rules as tests — for example, "the SDK never imports from `@brika/hub`". These run as regular `bun test` invocations.

If your change crosses a forbidden boundary, the archunit test will tell you. Fix the boundary, don't suppress the test.

## CI

Every PR runs:

* `bun run lint`
* `bun run typecheck`
* `bun test`

The trio. Plus a few build sanity checks (`bun run compile --target=headless` for one platform).

## Test data

Avoid network calls in tests. If you must reach a real service (rare), gate the test behind an environment variable and document it.

For fixture data, prefer in-test literals over `fixtures/foo.json` files — the literal is right next to the assertion.

## What doesn't need a test

* The SDK's own machinery (reactive engine, IPC, schema validation) — those have their own tests; relying on them is fine.
* Trivial getters / setters / pass-throughs.
* Generated code.

What does need a test:

* Anything you'd be unhappy to discover broken in production.
* Anything where the implementation could be wrong in non-obvious ways.
* Anything you've already fixed once — write the regression test.

## See also

* **[Coding Standards](coding-standards.md)** — code style.
* **[Testing (plugins)](../plugins/testing.md)** — author-facing plugin testing.
* **[Development Setup](development.md)** — running the test trio.
