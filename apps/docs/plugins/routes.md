# HTTP Routes

`defineRoute(method, path, handler)` registers an HTTP route on the hub under the plugin's URL namespace. Use this when you need a plain HTTP endpoint that something other than the Brika UI hits — webhooks from third parties, scripts, command-line clients.

For UI-to-server calls, prefer [actions](actions.md) — they are typed, easier to wire, and the compiler handles ID generation.

## Defining a route

```ts
import { defineRoute } from '@brika/sdk';

defineRoute('GET', '/status', () => ({
  status: 200,
  body: { ok: true, version: '0.4.0' },
}));

defineRoute('POST', '/webhook', async (req) => {
  const event = req.body as { event: string; data: unknown };
  await handleEvent(event);
  return { status: 204 };
});
```

The handler receives a `RouteRequest`:

```ts
interface RouteRequest {
  method: RouteMethod;            // 'GET' | 'POST' | 'PUT' | 'DELETE' | …
  path: string;                   // path inside the plugin's namespace
  query: Record<string, string>;  // query string params
  headers: Record<string, string>;
  body?: Json | Uint8Array;       // parsed JSON or raw bytes
}
```

And returns a `RouteResponse`:

```ts
interface RouteResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Json | Uint8Array;
}
```

## URL

Routes are served under `/api/plugins/<plugin-uid>/routes/<path>`. With the plugin UID `coingecko.plugin-coingecko` and path `/status`, the URL is:

```
http://127.0.0.1:3001/api/plugins/coingecko.plugin-coingecko/routes/status
```

In a brick or page, build the URL with `usePluginRouteUrl('/status')` — it resolves the plugin UID for you.

## Method

The first argument is the HTTP method. Common values: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`. Use the right verb — the hub's router dispatches on it.

## Errors

* Throwing a `BrikaError` translates to its canonical HTTP status: `PERMISSION_DENIED` → 403, `INVALID_INPUT` → 400, `NOT_FOUND` → 404, `TIMEOUT` → 504. The response body is `{ error, code }`.
* Throwing any other error falls through to `{ status: 500, body: { error: message } }`.

```ts
import { buildError } from '@brika/errors';

defineRoute('GET', '/devices/:id', async (req) => {
  const id = req.path.split('/').at(-1) ?? '';
  const device = await getDevice(id);
  if (!device) throw buildError('NOT_FOUND', { resource: 'device', id });
  return { status: 200, body: device };
});
```

## Permission

Add `"routes"` to your plugin's `permissions` array in `package.json`. Without the grant, `defineRoute` is a no-op.

## Authentication

Plugin routes inherit the hub's authentication: the request must carry a valid CLI token or user session. For webhooks from third parties that can't authenticate, configure the request to include a shared secret as a query parameter or header and validate it inside the handler.

## OAuth

`defineOAuth` (see [OAuth](oauth.md)) is built on top of `defineRoute` — it registers `/oauth/<id>/authorize` and `/oauth/<id>/callback` routes for you. If you need OAuth, use the helper.

## See also

* **[Actions](actions.md)** — typed RPCs for UI-to-server calls.
* **[OAuth](oauth.md)** — uses `defineRoute` for the callback handshake.
* **[Hub Server](../architecture/hub.md)** — how plugin routes integrate with the hub router.
