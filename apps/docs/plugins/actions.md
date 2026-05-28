# Actions

An **action** is a typed RPC the browser can call against the plugin process. Use them when a brick or page needs to fetch data from or trigger an effect in the server: list devices, scan for new hardware, send a command, return a thumbnail.

Actions are defined in the plugin process and called from bricks and pages. The action's ID is **auto-generated at build time** from a hash of `filePath:exportName`, so the developer never writes or sees it.

## Defining an action

```ts
// src/actions.ts
import { defineAction } from '@brika/sdk/actions';

interface Device { id: string; name: string }

export const listDevices = defineAction(async (): Promise<Device[]> => {
  return controller.getDevices();
});

export const scan = defineAction(async () => {
  return controller.discover();
});

export const send = defineAction(async ({ id, command }: { id: string; command: string }) => {
  await controller.send(id, command);
  return { ok: true };
});
```

`defineAction` returns an `ActionRef<TInput, TOutput>` — an opaque object with a hidden `__actionId` field. The phantom type parameters carry `TInput` and `TOutput` so callers get full type inference end-to-end.

* **No input** — handler takes no arguments. `useAction(ref)` calls without input.
* **One argument** — handler takes a single typed object. Callers pass it as the second argument to `useCallAction()`.

## Calling from a brick or page

```tsx
import { useAction, useCallAction } from '@brika/sdk/ui-kit/hooks';
import { listDevices, scan, send } from '../actions';

export default function DevicesPage() {
  const { data, loading, error, refetch } = useAction(listDevices);
  const call = useCallAction();

  if (error) return <div>Error: {error.message}</div>;
  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <button onClick={() => call(scan).then(refetch)}>Scan</button>
      {data?.map((d) => (
        <button key={d.id} onClick={() => call(send, { id: d.id, command: 'toggle' })}>
          {d.name}
        </button>
      ))}
    </div>
  );
}
```

* `useAction(ref)` fetches on mount, returns `{ data, loading, error, refetch }`. Types are inferred from the ref.
* `useCallAction()` returns a stable callback `(ref, input?) => Promise<TOutput>`. Use it for explicit invocations (buttons, form submits).

The browser does not need to know the action's ID. The compiler replaces the import of `listDevices` with a stub `{ __actionId: '<hash>' }` at build time; the runtime ID matches whatever the plugin process registered. See [Compiler](../architecture/compiler.md).

## How IDs are generated

The compiler walks every TypeScript file that imports `@brika/sdk/actions`, extracts the names of exports created with `defineAction`, and computes:

```
__actionId = SHA-256(`${relativePath}\0${exportName}`).slice(0, 12)
```

Properties:

* **Deterministic** — same file path + same export name always produce the same ID. No build-order or hash-counter shenanigans.
* **Collision-resistant** — 12 hex characters of SHA-256.
* **Independent client/server** — the client stub and the server registration compute the ID the same way, so they always agree.

If you rename an action's export, its ID changes. Anyone with a saved reference (a board layout, a workflow) would fall back to the error path. Renames are not free — treat them like API changes.

## Returning binary data

For thumbnails, exported images, or anything that should not pass through JSON, use `binaryResponse`:

```ts
import { binaryResponse, defineAction } from '@brika/sdk/actions';
import { readFile } from 'node:fs/promises';

export const readImage = defineAction(async ({ path }: { path: string }) => {
  const bytes = await readFile(path);
  return binaryResponse(bytes, 'image/png');
});
```

The page side receives a `Blob`:

```ts
const blob = await call(readImage, { path: '/data/x.png' });
const url = URL.createObjectURL(blob);
```

Bun's "advanced" IPC serialisation handles `Uint8Array` natively — no base64 in the loop. The hub turns the envelope into an HTTP response with the matching `Content-Type`; the browser sees a regular `Blob` of the right MIME type.

## Streaming a file

For large files that exist on disk, `streamFile` skips the round-trip through the plugin process entirely:

```ts
import { defineAction, streamFile } from '@brika/sdk/actions';

export const readEntry = defineAction(async ({ path }: { path: string }) => {
  return streamFile(path, 'video/mp4');
});
```

The handler hands the hub a virtual path and a content-type. The hub resolves the path through the plugin's granted fs scope, opens the file, and pipes `Bun.file(host).stream()` directly into the HTTP response. The bytes never enter the plugin process and never sit buffered in hub memory — only Bun's stream chunks (~16 KB) are in flight at a time.

Use `streamFile` for files; use `binaryResponse` for synthesised payloads (a thumbnail you generated on the fly, an SVG you composed, etc.).

## Error handling

A thrown error in an action handler becomes a rejected promise on the page side. Throw a `BrikaError` for typed errors:

```ts
import { buildError } from '@brika/errors';

export const send = defineAction(async ({ id }: { id: string }) => {
  const device = devices.get(id);
  if (!device) throw buildError('NOT_FOUND', { resource: 'device', id });
  return device.send();
});
```

The page can pattern-match the error:

```ts
import { matchBrikaError } from '@brika/sdk';

try {
  await call(send, { id: 'x' });
} catch (e) {
  matchBrikaError(e, {
    NOT_FOUND: (err) => alert(`No such device: ${err.data.id}`),
    default: (err) => alert(err.message),
  });
}
```

See [Errors](../api/errors.md) for the full error catalog.

## Permission

Add `"actions"` to your plugin's `permissions` array in `package.json` to enable the action system. Without it, `defineAction` is a no-op and the page can't call anything.

## See also

* **[Bricks](bricks.md)** — calling actions from a brick.
* **[Pages](pages.md)** — calling actions from a page.
* **[Errors](../api/errors.md)** — error envelope and catalog.
* **[Compiler](../architecture/compiler.md)** — action-id generation pipeline.
