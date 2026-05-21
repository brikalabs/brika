# Errors

Brika's error system is built around three ideas:

1. **One catalog drives everything** — HTTP status, severity, retryability, i18n keys, message templates, and typed data schemas all live in a single source of truth: [`packages/ipc/src/error-catalog.ts`](../../../packages/ipc/src/error-catalog.ts).
2. **Factories make throwing trivial** — `throw errors.permissionDenied({ permission: 'location' })`.
3. **Errors round-trip cleanly** — IPC channels, HTTP responses (RFC 9457 `application/problem+json`), and the FE all share the same code + data shape.

---

## Throwing errors

Import `errors` from `@brika/sdk` (plugin authors) or `@brika/ipc` (platform code) and call the factory for the code you want:

```ts
import { errors } from '@brika/sdk';

if (!hasGrant('location')) {
  throw errors.permissionDenied({ permission: 'location' });
}

const block = registry.get(id);
if (!block) {
  throw errors.notFound({ resource: `block:${id}` });
}

throw errors.timeout({ operation: 'fetch-weather', timeoutMs: 5000 });
throw errors.internal({ cause: dbError });
```

Every factory:

- Auto-builds the message from the catalog's template (override with `{ message: '...' }`).
- Validates the `data` shape against the catalog's Zod schema at type-check time.
- Accepts `{ cause }` for chaining underlying errors.
- Returns a typed `BrikaError<C, DataForCode<C>>`.

### Custom (uncataloged) codes

For plugin-defined codes not in the platform catalog, use `buildCustomError`:

```ts
import { buildCustomError } from '@brika/sdk';

throw buildCustomError('PLUGIN_RATE_LIMITED', 'too many requests', {
  data: { remainingMs: 30_000 },
});
```

Uncataloged codes still work end-to-end (wire round-trip, HTTP envelope) but receive default treatment (HTTP 500, `retryable: false`, no i18n).

---

## Catching errors

### Single code — `BrikaError.is`

```ts
import { BrikaError } from '@brika/sdk';

try {
  await ctx.getLocation();
} catch (err) {
  if (BrikaError.is(err, 'PERMISSION_DENIED')) {
    // err is BrikaError<'PERMISSION_DENIED', { permission: string }>
    console.log(`missing: ${err.data?.permission}`);
  }
}
```

`BrikaError.is(err, 'CODE')` narrows both the code and the `data` shape via the catalog's Zod schema.

### Multiple codes — `matchBrikaError`

```ts
import { matchBrikaError } from '@brika/sdk';

const view = matchBrikaError(err, {
  PERMISSION_DENIED: ({ permission }) => `Missing: ${permission}`,
  NOT_FOUND: ({ resource }) => `Gone: ${resource}`,
  TIMEOUT: ({ operation, timeoutMs }) => `Timeout: ${operation} (${timeoutMs}ms)`,
  _: () => 'Something went wrong',
});
```

Each handler is typed against the catalog data shape for its code. The `_` arm is **required** — it catches uncataloged codes, plain `Error`s, and non-Error values.

---

## Adding a new code

1. **Add a catalog entry** in [`packages/ipc/src/error-catalog.ts`](../../../packages/ipc/src/error-catalog.ts):

   ```ts
   QUOTA_EXCEEDED: entry({
     title: 'Quota exceeded',
     description: 'Plugin exceeded its per-hour API quota.',
     typeUri: 'https://brika.dev/errors/quota-exceeded',
     status: 429,
     severity: 'error',
     category: 'core',
     retryable: true,
     transient: true,
     i18nKey: 'errors.quota_exceeded',
     developerHint: 'Wait until `data.resetAt` before retrying.',
     data: z.object({
       resetAt: z.string(),  // ISO timestamp
       limit: z.number(),
     }),
     message: ({ limit }) => `API quota of ${limit}/hour exceeded.`,
   }),
   ```

2. **Add a factory** in [`packages/ipc/src/factories.ts`](../../../packages/ipc/src/factories.ts):

   ```ts
   quotaExceeded: (data: DataForCode<'QUOTA_EXCEEDED'>, opts?: FactoryOpts) =>
     buildError<'QUOTA_EXCEEDED'>('QUOTA_EXCEEDED', data, opts),
   ```

3. **Add the i18n key** to `apps/hub/src/locales/{en,fr}/common.json`:

   ```json
   "quota_exceeded": "API quota of {{limit}}/hour exceeded."
   ```

4. **Use it**:

   ```ts
   throw errors.quotaExceeded({ resetAt: '2026-01-01T00:00:00Z', limit: 1000 });
   ```

The factory coverage test in [`packages/ipc/src/__tests__/factories.test.ts`](../../../packages/ipc/src/__tests__/factories.test.ts) ensures every throwable cataloged code has a factory.

---

## Wire format (RFC 9457)

HTTP responses use [`application/problem+json`](https://www.rfc-editor.org/rfc/rfc9457) with Brika extensions:

```json
{
  "type": "https://brika.dev/errors/permission-denied",
  "title": "Permission denied",
  "status": 403,
  "detail": "Permission \"location\" is required but not granted.",
  "instance": "/api/sparks/emit",
  "code": "PERMISSION_DENIED",
  "data": { "permission": "location" },
  "i18nKey": "errors.permission_denied",
  "developerHint": "Add \"location\" to \"permissions\" in your plugin's package.json.",
  "retryable": false,
  "traceId": "f4a2b1c0-7d3e-4a5f-8b9c-1d2e3f4a5b6c"
}
```

**Standard fields** (RFC 9457):

| Field | Meaning |
|-------|---------|
| `type` | Stable URI identifying the problem class (`about:blank` if uncataloged) |
| `title` | Short human summary |
| `status` | HTTP status (matches response status) |
| `detail` | Long human-readable explanation specific to this occurrence |
| `instance` | URI reference for this specific occurrence (request path) |

**Brika extensions:**

| Field | Meaning |
|-------|---------|
| `code` | Machine-readable code (e.g. `PERMISSION_DENIED`) |
| `data` | Structured payload typed per code |
| `i18nKey` | Translation key for FE localization |
| `developerHint` | Actionable advice for plugin authors |
| `retryable` | Whether the client should retry without changing inputs |
| `traceId` | Request correlation id |

### IPC wire format

Across the IPC channel (process-to-process), errors use a leaner shape:

```json
{
  "_brikaError": true,
  "code": "PERMISSION_DENIED",
  "message": "Permission \"location\" is required but not granted.",
  "data": { "permission": "location" },
  "cause": { ... },
  "stack": "..."
}
```

The receiver reconstructs a `BrikaError` instance via `BrikaError.fromWire`. Cause chains round-trip recursively; cycles terminate with `[circular cause]`.

---

## Frontend consumption

The FE's `fetcher` automatically parses error responses into `BrikaApiError`:

```ts
import { isBrikaApiError, BrikaApiError } from '@/lib/query';

try {
  const data = await fetcher('/api/sparks');
} catch (err) {
  if (isBrikaApiError(err, 'PERMISSION_DENIED')) {
    // err.data?.permission is typed string
    showToast(t(err.i18nKey ?? 'errors.generic', err.data));
  }
}
```

React Query's default `retry:` handler reads `err.retryable` — codes marked `retryable: true` (TIMEOUT, UNAVAILABLE) get up to 3 automatic retries; the rest fail-fast.

---

## Observability

Every BrikaError construction fires registered `onThrow` handlers:

```ts
import { BrikaError } from '@brika/sdk';

const off = BrikaError.onThrow((err) => {
  metrics.increment('brika.errors.total', { code: err.code, retryable: isRetryable(err.code) });
  if (err.code === 'INTERNAL') {
    sentry.captureException(err);
  }
});
// later: off() to deregister
```

Handlers run synchronously in error-construction order; a buggy handler never affects error flow (exceptions inside handlers are swallowed).

The hub's HTTP layer additionally logs every error response with structured fields: `code`, `traceId`, `retryable`, `status`, `duration`, and the cause-chain message.

---

## Catalog quick reference

| Code | Status | Retryable | Category |
|------|--------|-----------|----------|
| `INTERNAL` | 500 | no | core |
| `INVALID_INPUT` | 400 | no | core |
| `NOT_FOUND` | 404 | no | core |
| `PERMISSION_DENIED` | 403 | no | core |
| `TIMEOUT` | 504 | **yes** | core |
| `UNAVAILABLE` | 503 | **yes** | core |
| `PLUGIN_NOT_FOUND` | 404 | no | manifest |
| `PLUGIN_CONFIG_INVALID` | 400 | no | manifest |
| `MANIFEST_INVALID` | 400 | no | manifest |
| `MANIFEST_MISSING_MAIN` | 400 | no | manifest |
| `WORKFLOW_*` | 400 | no | workflow (diagnostic only — not thrown) |

See the catalog for the full set + Zod data schemas.

---

## Migration from RpcError (pre-`feat/brika-error`)

| Old | New |
|-----|-----|
| `new RpcError('PERMISSION_DENIED', msg, { permission })` | `errors.permissionDenied({ permission })` |
| `err instanceof PermissionDeniedError` | `BrikaError.is(err, 'PERMISSION_DENIED')` |
| `.catch(rethrowRpcError)` | (no longer needed — channel reconstructs typed errors automatically) |
| `sdkErrors[]` registry | (gone — replaced by the catalog) |
