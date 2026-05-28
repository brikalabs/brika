# Build Your First Plugin

By the end of this tutorial you'll have:

* A working Brika plugin scaffolded by `bun create brika`.
* One **reactive block** that fetches the current price of a cryptocurrency on a schedule.
* One **brick** that renders the live price on a dashboard.
* The plugin installed into a local hub, the block wired into a workflow, and the brick on a board.

You'll need:

* [Bun](https://bun.sh) ≥ 1.2 installed.
* A Brika hub installed (see [Installation](../basics/installation.md)).
* About 30 minutes.

## 1. Scaffold

```sh
bun create brika
```

The interactive prompts ask for:

* **Plugin name** — `coingecko-price` for this tutorial.
* **Display name** — `Coingecko Price`.
* **What does it provide?** — pick *Blocks*, *Bricks*, and *Sparks*. Leave Pages/Actions off.
* **Author**, **license**, etc.

```sh
cd coingecko-price
bun link        # makes the plugin discoverable as a workspace dep
```

The scaffolder generates a TypeScript project with one example block, one example brick, an `i18n` folder, a `tsconfig.json`, and a `package.json` set up for the SDK.

Open `package.json` and look at the `blocks`, `bricks`, and `sparks` arrays — these are the **manifest entries** the hub reads to discover what the plugin contributes. Every entry needs an `id`, `name`, and `description` at minimum. See [Manifest Reference](../plugins/manifest.md) for the full schema.

## 2. Define the spark

Sparks are typed events. We'll publish a `price-update` spark every time the block fetches a new price so any other workflow on the hub can react to it.

Delete the example spark file and replace `src/sparks.ts` with:

```ts
import { z } from '@brika/sdk';
import { defineSpark } from '@brika/sdk/sparks';

export const priceUpdate = defineSpark({
  id: 'price-update',
  schema: z.object({
    symbol: z.string(),
    usd: z.number(),
    at: z.number(),
  }),
});
```

`defineSpark` returns a compiled object with `.emit(payload)`. The payload is checked at compile time against the Zod schema.

In `package.json` add the entry the hub uses to advertise the spark in the UI:

```json
"sparks": [
  { "id": "price-update", "name": "Price update", "description": "Emitted on every price fetch" }
]
```

## 3. Define the block

Replace `src/blocks/example.ts` with `src/blocks/price.ts`:

```ts
import { defineReactiveBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { priceUpdate } from '../sparks';

export const price = defineReactiveBlock(
  {
    id: 'price',
    inputs: {
      trigger: input(z.generic(), { name: 'Trigger' }),
    },
    outputs: {
      usd: output(z.number(), { name: 'USD' }),
    },
    config: z.object({
      symbol: z.string().default('bitcoin'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${config.symbol}&vs_currencies=usd`;
      const res = await fetch(url);
      const body = (await res.json()) as Record<string, { usd: number }>;
      const usd = body[config.symbol]?.usd;
      if (typeof usd !== 'number') {
        log.warn(`No price returned for ${config.symbol}`);
        return;
      }
      outputs.usd.emit(usd);
      priceUpdate.emit({ symbol: config.symbol, usd, at: Date.now() });
    });
  }
);
```

What's happening:

* The block has one input (`trigger`, `z.generic()` — accepts any value, only the *fact* that it fired matters) and one output (`usd`, a number).
* `config` is a Zod object the user fills in via the workflow editor.
* The setup function wires `inputs.trigger.on(…)` — whenever something pushes a value into the trigger port, fetch the price, emit it on the `usd` output, and broadcast a spark.
* `log.info`/`log.warn` go to the hub's log stream.

Add the manifest entry in `package.json`:

```json
"blocks": [
  {
    "id": "price",
    "name": "Crypto price",
    "description": "Fetch the current USD price of a cryptocurrency",
    "category": "action",
    "icon": "trending-up",
    "color": "#f59e0b"
  }
]
```

Re-export the block from `src/index.tsx`:

```ts
export { price } from './blocks/price';
```

This is enough to *use* the block. The hub will load the plugin, see the `blocks: [{ id: "price", … }]` entry in the manifest, and when the workflow runtime calls `startBlock { blockType: "price" }`, the SDK looks up the compiled block from the plugin's module exports.

See [Reactive Blocks](../plugins/reactive-blocks.md) and [Reactive Streams](../plugins/reactive-streams.md) for the full vocabulary (`map`, `filter`, `debounce`, `combine`, etc.).

## 4. Define the brick

Bricks render in the **browser** — they are real React components. They get data from `setBrickData(brickId, data)` calls in the plugin process and read it with `useBrickData<T>()` in the browser.

Create `src/bricks/current-price.tsx`:

```tsx
import { useBrickData } from '@brika/sdk/brick-views';

interface PriceData {
  symbol: string;
  usd: number;
  at: number;
}

export default function CurrentPrice() {
  const data = useBrickData<PriceData>();
  if (!data) return <div className="p-4 text-muted-foreground">Waiting for a price…</div>;
  return (
    <div className="flex h-full flex-col justify-center p-6">
      <span className="text-xs uppercase text-muted-foreground">{data.symbol}</span>
      <span className="mt-1 text-4xl font-bold">${data.usd.toLocaleString()}</span>
      <span className="mt-2 text-xs text-muted-foreground">
        {new Date(data.at).toLocaleTimeString()}
      </span>
    </div>
  );
}
```

Tailwind classes work out of the box — the [compiler](../architecture/compiler.md) extracts the classes the brick uses, generates a scoped stylesheet, and injects it inline so it can't bleed into the host UI.

Declare the brick in `package.json`:

```json
"bricks": [
  {
    "id": "current-price",
    "name": "Crypto price",
    "description": "Live cryptocurrency price",
    "category": "finance",
    "icon": "trending-up",
    "color": "#f59e0b"
  }
]
```

Bricks are **not** exported from `src/index.tsx`. The hub discovers them from the manifest, locates the file at `src/bricks/<id>.tsx`, and compiles it on demand. Plugins do not register bricks with `registerBrickType` from JS — the manifest is enough.

## 5. Push data from plugin to brick

Bricks receive data via `setBrickData(brickId, value)` calls in the plugin process. Add this to `src/index.tsx`:

```tsx
import { setBrickData } from '@brika/sdk';
import { onInit, onStop, log } from '@brika/sdk/lifecycle';

export { price } from './blocks/price';
export { priceUpdate } from './sparks';

onInit(async () => {
  // Push the brick into "loading" state on hub startup
  setBrickData('current-price', null);
});

// Whenever the spark fires, mirror it to the brick.
import { priceUpdate } from './sparks';
priceUpdate.subscribe((payload) => {
  setBrickData('current-price', payload);
});

onStop(() => log.info('Coingecko Price plugin stopping'));
```

`setBrickData` is plugin-wide: every browser currently rendering `current-price` will re-render with the new value. The transport is the shared SSE channel (see [Shared SSE Pool](../architecture/sse-pool.md)) — no per-brick connection.

## 6. Install into a local hub

In the hub workspace's `.brika/brika.yml` add:

```yaml
plugins:
  "@your-scope/coingecko-price":
    version: "workspace:./plugins/coingecko-price"
```

…assuming the plugin lives at `plugins/coingecko-price` inside the hub workspace. If you scaffolded it elsewhere, use a `file:` version or copy it in.

Restart the hub:

```sh
brika stop
brika start
```

Open the UI. **Plugins → Installed** should show `Coingecko Price` with a *running* badge. If it's *crashed* or *awaiting-config*, check the **Logs** panel — typos in the manifest, schema validation errors, or import errors all show up there.

## 7. Wire a workflow

* Open **Workflows → New**.
* Drop the built-in `clock` block onto the canvas. Set its interval to `60s`.
* Drop the `price` block. Set the symbol to `ethereum`.
* Connect the `clock` output to the `price` block's `trigger` input.
* Click **Enable**.

Watch **Logs** — you should see a log line every minute when the fetch happens, with the current ETH price.

## 8. Place the brick

* Open **Boards → New**.
* Click **Add brick**, pick `Crypto price` from your plugin.
* Resize and position it.
* Save.

The brick should immediately fill in with the latest price the next time the workflow ticks.

## 9. Publish

```sh
cd coingecko-price
bun run prepublishOnly   # runs `brika-verify-plugin` (validates manifest, runs verify-checks)
bun publish
```

`brika-verify-plugin` runs the [verify-checks system](../plugins/publishing.md) — every check registered in `@brika/sdk/verify-checks` runs against your plugin and prints any errors or warnings. Once it passes, `bun publish` ships to npm.

Users install your plugin from the UI (**Plugins → Registry**) or by adding the npm name to their `brika.yml`.

## Where to go next

* **[Plugin Overview](../plugins/overview.md)** — the full SDK surface.
* **[Reactive Streams](../plugins/reactive-streams.md)** — `debounce`, `throttle`, `combine`, `switchMap`, …
* **[Actions](../plugins/actions.md)** — let your brick call the plugin process synchronously.
* **[Schema Types](../plugins/schema-types.md)** — `z.duration`, `z.color`, `z.expression`, `z.passthrough`, …
* **[Compiler](../architecture/compiler.md)** — what `bun create brika` really does under the hood.
