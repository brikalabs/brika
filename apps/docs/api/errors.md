# Errors

The hub returns errors in a uniform envelope. A `BrikaError` (defined in `@brika/errors`) maps to:

* An HTTP status (per RFC 9457 conventions).
* A JSON response body with `code`, `error` (message), and optional `data`.
* On the IPC side: a `_brikaError: true` wire envelope.

## Wire envelope

HTTP response body for any failure:

```json
{
  "code": "NOT_FOUND",
  "error": "Plugin not found",
  "data": { "uid": "missing.plugin" }
}
```

* `code` — a stable string identifier (uppercase snake-case).
* `error` — human-readable message, English, intended for developers.
* `data` — structured context for the error (optional, code-dependent).

The same envelope crosses IPC as `{ _brikaError: true, code, message, data?, cause?, stack? }` so plugin processes and the hub see the same shape.

## Codes and status

The error catalog lives in `@brika/errors` (`packages/errors/src/catalog/`). Each entry maps a code to:

* HTTP status.
* Severity (`info`, `warn`, `error`).
* Whether retrying makes sense.
* i18n key for the UI.

Common codes:

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_INPUT` | 400 | Request body or query failed Zod validation |
| `UNAUTHENTICATED` | 401 | No credentials |
| `PERMISSION_DENIED` | 403 | Credentials present but scope insufficient (or plugin permission missing) |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Resource already exists / state conflict |
| `MISDIRECTED_REQUEST` | 421 | Host header allowlist rejection |
| `RATE_LIMITED` | 429 | Too many requests; `Retry-After` header set |
| `INTERNAL` | 500 | Unexpected server error |
| `TIMEOUT` | 504 | Operation exceeded its deadline |
| `SERVICE_UNAVAILABLE` | 503 | Hub starting up, shutting down, or plugin unavailable |

The catalog is open to additions — `lookupCatalogEntry(code)` returns the metadata for any code, and the SDK re-exports helpers for working with them.

## Validation errors

Zod validation failures return **400** with `code: "INVALID_INPUT"` and `data.issues` containing the Zod issue array:

```json
{
  "code": "INVALID_INPUT",
  "error": "Invalid configuration",
  "data": {
    "issues": [
      { "path": ["interval"], "code": "invalid_type", "expected": "number", "received": "string", "message": "Expected number, received string" }
    ]
  }
}
```

The hub uses this for body validation, query validation, path-param validation, and (for `/api/plugins/:uid/config`) plugin preference validation.

## SDK helpers

Plugin code can build and pattern-match errors:

```ts
import { buildError, matchBrikaError, BrikaError } from '@brika/sdk';

throw buildError('NOT_FOUND', { resource: 'device', id });

try {
  await something();
} catch (e) {
  matchBrikaError(e, {
    NOT_FOUND: (err) => console.log('missing:', err.data.id),
    PERMISSION_DENIED: () => console.log('add the grant'),
    default: (err) => console.error(err.message),
  });
}
```

`buildError(code, data)` requires the data shape to match the catalog's declaration for that code (TypeScript checks this). `buildCustomError(code, message)` is the escape hatch for ad-hoc errors that don't belong in the catalog.

## Browser-side handling

The UI's API client normalises errors:

```ts
try {
  await api.plugins.uninstall(uid);
} catch (e) {
  if (e instanceof BrikaError && e.code === 'NOT_FOUND') {
    toast.warn(t('plugin.alreadyGone'));
  } else {
    toast.error(e.message);
  }
}
```

`BrikaError` instances cross HTTP via the envelope and are reconstructed client-side by the API client.

## i18n

Every catalog entry has an i18n key. The UI uses it to render localised error messages, falling back to the English `message` if no translation exists.

## Retryable vs not

`isRetryable(code)` returns true for codes like `TIMEOUT`, `SERVICE_UNAVAILABLE`, `RATE_LIMITED`. The UI uses this for retry buttons; SDK consumers can use it to drive their own retry logic.

## See also

* **[Authentication](authentication.md)** — auth-related errors.
* **[Actions](../plugins/actions.md)** — throwing errors from plugin actions.
* **[REST Reference](rest-reference.md)** — every endpoint that can emit errors.
