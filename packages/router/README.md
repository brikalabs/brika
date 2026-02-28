# @brika/router

HTTP router for Brika services built on [Hono](https://hono.dev/) with `@brika/di` integration, Zod validation, and built-in middleware.

## Features

- **Route Builder** — Type-safe `route.get/post/put/delete` with Zod body/params/query schemas
- **Route Groups** — Prefix + shared middleware via `group()`
- **Rate Limiting** — Sliding window counter middleware with memory-efficient store
- **SSE** — Server-Sent Events helpers
- **DI Integration** — `inject()` available in route handlers

## Usage

### Defining Routes

```typescript
import { route, group } from '@brika/router';
import { z } from 'zod';

const getUser = route.get({
  path: '/:id',
  params: z.object({ id: z.string().uuid() }),
  handler: async (ctx) => {
    const user = ctx.inject(UserService).getUser(ctx.params.id);
    return { user };
  },
});

const createUser = route.post({
  path: '/',
  body: z.object({ email: z.string().email(), name: z.string() }),
  handler: async (ctx) => {
    const user = ctx.inject(UserService).createUser(ctx.body.email, ctx.body.name);
    return { user };
  },
});

export const userRoutes = group({
  prefix: '/api/users',
  middleware: [requireAuth()],
  routes: [getUser, createUser],
});
```

### Rate Limiting

Built-in sliding window counter for accurate, memory-efficient rate limiting:

```typescript
import { rateLimit } from '@brika/router';

// Per-route: 5 requests per 60 seconds
route.post({
  path: '/login',
  middleware: [rateLimit({ window: 60, max: 5 })],
  handler: loginHandler,
});

// Group-level: 100 requests per minute for all API routes
group({
  prefix: '/api',
  middleware: [rateLimit({ window: 60, max: 100 })],
  routes: [...],
});

// Custom key extractor (default: x-real-ip header)
rateLimit({
  window: 60,
  max: 5,
  key: (c) => c.req.header('x-api-key') ?? 'anon',
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `window` | `number` | — | Time window in seconds |
| `max` | `number` | — | Max requests per window |
| `key` | `(c) => string` | `x-real-ip` header | Key extractor function |
| `maxKeys` | `number` | `10000` | Max tracked keys (prevents memory exhaustion) |
| `cleanupInterval` | `number` | `60000` | Ms between expired-entry sweeps (0 to disable) |
| `message` | `string` | `'Too many requests'` | Custom 429 error message |

**Response headers** (set on every response):
- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — requests left
- `X-RateLimit-Reset` — Unix timestamp when window resets
- `Retry-After` — seconds until retry (only on 429)

### Creating the App

```typescript
import { createApp } from '@brika/router';

const app = createApp(allRoutes, [globalMiddleware()]);
Bun.serve({ fetch: app.fetch, port: 3000 });
```

## Exports

```typescript
// Route builders
export { createApp, route, group, combineRoutes };

// Middleware
export { rateLimit, type RateLimitOptions };

// Exceptions
export { HttpException, BadRequest, Unauthorized, Forbidden, NotFound, Conflict, UnprocessableEntity, InternalServerError };

// SSE
export { createSSEStream, createAsyncSSEStream };

// Types
export type { Middleware, RouteContext, RouteDefinition, Handler, HttpMethod, Schema, RouteInput };
```

## License

MIT
