# Config Variables

A block's **string config fields** can embed `{{ }}` expressions that reference
the data flowing into the block. They are resolved by the runtime on every input
event, so a single block definition adapts its behavior to each value it receives.

```ts
import { defineBlock, input, output, z } from '@brika/sdk';

export const notify = defineBlock({
  id: 'notify',
  inputs: { in: input(z.generic(), { name: 'Input' }) },
  outputs: { out: output(z.string(), { name: 'Message' }) },
  config: z.object({
    message: z.string().describe('Supports {{ inputs.in.field }} expressions'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in.on(() => {
      // `config.message` is already resolved against the latest input.
      outputs.out.emit(config.message);
    });
  },
});
```

Place the block after a source emitting `{ user: 'Ada' }` and set the message to
`Hello {{ inputs.in.user }}`. Each event logs `Hello Ada`, `Hello Grace`, and so on.
You never parse the expression yourself: you read `config.message` and the runtime
has already substituted it.

## Scope

Expressions resolve against two namespaces, both relative to **this block**:

| Reference | Resolves to |
| --- | --- |
| `{{ inputs.<port> }}` | the latest value received on the named input port |
| `{{ config.<key> }}` | another (non-templated) config value |

Dotted paths navigate into objects and arrays:

```
{{ inputs.in.user.name }}      object property
{{ inputs.in.items.0 }}        array index
{{ config.baseUrl }}/users     mixed with surrounding text
```

The names match the editor's variable picker one-to-one. When you wire an edge
into a block, the picker suggests `{{ inputs.<port> }}` (and nested paths from the
upstream type) and, once a run has produced data, shows the **value last seen** on
each path so you can author expressions against real data. The same last value is
shown on the node itself on the canvas.

## Resolution rules

* **Per event.** The scope holds the most recent value on each input port. An
  expression is resolved when the field is read inside a handler, against whatever
  has arrived so far. Read the field at the top of your handler if you `await`
  afterwards, so a concurrent event cannot change the value mid-flight.
* **String result.** Resolution always produces a string: objects render as JSON,
  numbers and booleans via `String`, and a missing path (or unknown root) renders
  the empty string. This keeps `z.string()` config fields type-safe.
* **Zero cost when unused.** A config field with no `{{ }}` is delivered verbatim,
  and a block with no templated field is not wrapped at all.
* **Runtime-side.** Resolution happens in the plugin process, where config and
  input events already meet. There is no host round-trip per event.

## Templates vs. path selectors

Because resolution always yields a **string**, use `{{ }}` for fields whose value is
a string: a prompt, a URL, a request body, a log line, a message.

Do **not** use `{{ }}` for a field that names a path the block resolves to a typed
value (for example a "field to compare" selector that reads a number off the input).
Such a field would be turned into a stringified value before your block sees it. Use
a **plain dot path** there instead:

```ts
// A path-selector config: plain dot path, NOT {{ }}.
config: z.object({
  field: z.string().describe('Dot path into the input, e.g. "user.status"'),
}),
run: ({ inputs, config }) => {
  inputs.in.on((data) => {
    const value = getField(data, config.field); // your own path lookup
    // ...
  });
},
```

The rule of thumb: `{{ }}` builds a **string from data**; a plain path **selects a
value from data**. The two never mix in one field.

## Example: a prompt field

A common pattern is a field the operator fills in with static text or a template,
backed by a generic trigger input so any upstream value can drive it:

```ts
inputs: { in: input(z.generic(), { name: 'Input' }) },
config: z.object({
  prompt: z
    .string()
    .optional()
    .describe('Reference incoming data with {{ inputs.in }} or {{ inputs.in.field }}'),
}),
run: ({ inputs, config }) => {
  inputs.in.on((data) => {
    const prompt = config.prompt?.trim() || (typeof data === 'string' ? data : '');
    if (!prompt) return;
    // ... use `prompt`
  });
},
```

A bare trigger (a Button click, a clock tick) runs it with the static prompt; a
wire carrying a string is used when the field is left empty; and `{{ inputs.in.x }}`
interpolates structured upstream data. This is how the built-in **Ask Claude** and
**AI Agent** blocks take their prompt.

## See also

* [Reactive Blocks](reactive-blocks.md) for block anatomy and ports.
* [Schema Types](schema-types.md) for the config schema helpers.
