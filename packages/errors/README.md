# @brika/errors

Typed error catalog, factories, match helper, and RFC 9457 HTTP envelope for the Brika platform.

Every error that crosses an IPC, HTTP, or workflow boundary in Brika is a `BrikaError`. The catalog is the single source of truth for error codes, their data shape, category, severity, and HTTP mapping — used by the hub, the SDK, plugins, and the UI to keep error handling exhaustive and refactor-safe.

## Why

- **Type-safe `match` against the catalog** — `matchBrikaError(err, { PERMISSION_DENIED: …, _: … })` is exhaustive and TypeScript knows the data shape for each branch.
- **One serialization** — IPC and HTTP share the same envelope; the SDK reconstructs typed errors from the wire payload.
- **RFC 9457 compliant** — HTTP responses follow the `application/problem+json` standard so consumers outside the Brika SDK still get structured errors.

## Throwing

```ts
import { errors } from '@brika/errors';

throw errors.permissionDenied({ permission: 'location' });
throw errors.timeout({ operation: 'fetchProfile', timeoutMs: 5000 });
```

## Narrowing

```ts
import { BrikaError, matchBrikaError } from '@brika/errors';

if (BrikaError.is(err, 'PERMISSION_DENIED')) {
  console.log(err.data?.permission); // string
}

const human = matchBrikaError(err, {
  PERMISSION_DENIED: ({ permission }) => `Missing: ${permission}`,
  TIMEOUT: ({ operation, timeoutMs }) => `Timed out: ${operation} (${timeoutMs}ms)`,
  _: () => 'Unknown error',
});
```

## HTTP envelope

```ts
import { toProblemJson, fromProblemJson } from '@brika/errors/http';

return new Response(JSON.stringify(toProblemJson(err)), {
  status: err.status,
  headers: { 'content-type': 'application/problem+json' },
});
```

## Adding a new error code

1. Add the entry to `src/catalog/` with `code`, `category`, `severity`, `defaultMessage`, and a Zod schema for `data`.
2. Export a factory in `src/factories.ts`.
3. Re-export from `src/index.ts`.

The factory is the only public way to create errors of that code — keeping the catalog the closed enumeration the rest of the platform can rely on.

## Consumers

8 packages depend on this. Among them: `@brika/sdk`, `@brika/hub`, `@brika/auth`, `@brika/ipc`, `@brika/grants`.

## See also

- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [docs.brika.dev — Errors reference](https://docs.brika.dev/api-reference/errors)
