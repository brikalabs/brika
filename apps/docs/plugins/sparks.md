# Sparks

Sparks are typed events on a hub-wide event bus. A plugin emits sparks; any block on any plugin can subscribe to them. Use sparks when "one thing happened, many things might want to know" feels more natural than wiring connectors.

## Defining a spark

```ts
import { defineSpark, z } from '@brika/sdk';

export const priceUpdate = defineSpark({
  id: 'price-update',
  schema: z.object({
    symbol: z.string(),
    usd: z.number(),
    at: z.number(),
  }),
});
```

* The `id` is local to the plugin. The hub prepends the plugin name for the wire identifier, so subscribers across plugins see `coingecko:price-update`.
* `schema` is a Zod schema for the payload. The hub registers it so the UI can display the payload structure when wiring spark subscribers.

Every spark must also be declared in `package.json`:

```json
"sparks": [
  { "id": "price-update", "name": "Price Update", "description": "Emitted on every fetch" }
]
```

## Emitting

```ts
priceUpdate.emit({ symbol: 'bitcoin', usd: 95234.12, at: Date.now() });
```

The emission goes to every subscriber on the hub — local blocks subscribing via `subscribeSpark`, the UI sparks panel, and any other plugin that has subscribed.

In development mode the SDK calls `schema.safeParse` on each emission and warns if the payload doesn't match. In production this check is skipped.

## Subscribing from a block

`subscribeSpark` returns a `Source<SparkEvent>` you can `start()` from a block setup function:

```ts
import { defineReactiveBlock, output, subscribeSpark, map, z } from '@brika/sdk';

export const sparkReceiver = defineReactiveBlock(
  {
    id: 'spark-receiver',
    inputs: {},
    outputs: {
      payload: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
    },
    config: z.object({
      sparkType: z.sparkType('Spark to listen for'),
    }),
  },
  ({ config, outputs, start }) => {
    start(subscribeSpark(config.sparkType))
      .pipe(map((event) => event.payload))
      .to(outputs.payload);
  }
);
```

Key points:

* `config.sparkType` is a `z.sparkType()` field. The host no longer hardcodes a spark picker for it: a block chooses how to surface the field through its own [custom view](reactive-blocks.md#custom-block-views). The built-in `spark-receiver` view (`plugins/blocks-builtin/src/blocks/spark-receiver.view.tsx`) fetches `/api/sparks` and renders a dropdown grouped by plugin.
* `output(z.resolved('spark', 'sparkType'), …)` tells the type system that this output's type depends on the spark schema referenced by the `sparkType` config field. The UI uses this to type-check the connection.
* `subscribeSpark` returns a `Source<SparkEvent>`; passing it to `start()` ties the subscription to the block's cleanup registry.

`SparkEvent` is `{ type: string; payload: Json; emittedAt: number }`. Use `.pipe(map((e) => e.payload))` to peel off the payload.

## Sparks vs block outputs

* **Block outputs** are point-to-point. The user connects them in the workflow editor. The wiring is explicit and visible.
* **Sparks** are pub-sub. The user picks a spark type in a block's config; the wiring is implicit and global.

Use block outputs for typical workflow data flow. Use sparks for cross-cutting events where many unrelated workflows might want to react — "a Matter device was paired," "the user pressed a hardware button," "the hub regained internet access."

## Where they show up in the UI

The **Sparks** page lists every defined spark, recent emissions, and the payload schema. Useful for debugging — emit a spark, refresh the page, watch the event arrive.

## See also

* **[Reactive Blocks](reactive-blocks.md)** — subscribing inside a block.
* **[Schema Types](schema-types.md)** — `z.sparkType()` and `z.resolved()` references.
* **[IPC Protocol](../architecture/ipc-protocol.md)** — the spark contract on the wire.
