# Coding Standards

Brika code is opinionated. Most of these aren't novel — they're things every TypeScript codebase eventually settles on — but they're enforced here.

## TypeScript

### Strict mode

`strict: true` everywhere. `noUncheckedIndexedAccess: true`. No exceptions. If you're tempted to relax a flag, it's a code smell — narrow types instead.

### No `as` casts and no `any`

* **No `as` type casts.** Use proper typing, type narrowing, imports, and conditional checks instead.
* **No `any`.** If you're reaching for it, you probably want `unknown` with a narrowing check, or a typed union.

There are rare, justified exceptions (Bun's older type defs, some Zod internals); these are flagged with `@ts-expect-error` comments explaining why. Don't add new ones without a good reason.

### Prefer zod over typeof guards

When you need to validate that a value matches a shape at runtime, **use zod**, not a hand-rolled `typeof` + `in` chain. Zod is already a workspace dependency. The schema lives next to the type, the typing is automatic, and validation errors are structured.

```ts
// ✗ avoid
function isWeather(x: unknown): x is Weather {
  return typeof x === 'object' && x !== null && 'tempC' in x && typeof (x as Weather).tempC === 'number';
}

// ✓ prefer
const Weather = z.object({ tempC: z.number(), city: z.string() });
const result = Weather.safeParse(x);
if (!result.success) { … }
```

### Readonly props

React component props must be `Readonly<>`. SonarQube rule S6759 enforces it — don't strip it as "cosmetic".

```ts
function StatCard({ label, value }: Readonly<{ label: string; value: number }>) { … }
```

### No legacy code or defensive type-narrowing

Reject legacy/migration paths and runtime `typeof` defensive checks. Trust the schema. If a transitional code path is needed, surface it as a separate concern — not buried inside the consumer.

The schema is the source of truth. By the time data reaches the consumer, it's been validated.

## React

### No shared Tailwind class constants

Don't extract Tailwind class strings into shared constants. Keep duplicated class strings inline per component. The cost of duplication is paid once when you read the diff; the cost of indirection is paid every time you debug.

### Bricks and pages — plain React

Use the standard React API. Don't import from `@brika/sdk/jsx-runtime` (no such subpath). The compiler rewrites `react/jsx-runtime` to the bridge for you. `tsconfig.json` must have `"jsxImportSource": "react"`.

## Comments

* Default to writing no comments.
* Add a comment only when the **why** is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, behaviour that would surprise a reader.
* Don't explain **what** the code does — well-named identifiers do that.
* Don't reference the current task, fix, or callers ("used by X", "added for Y", "handles the case from #123"). PR descriptions own that history; comments rot.

## Imports

* Always use the workspace's exported entry points (`@brika/sdk`, not `../../packages/sdk/src/...`).
* Sort imports by Biome's default (groups by source: node, npm, project).

## Tests

* Integration tests must hit a real database, not mocks. We had a prior incident where mock/prod divergence masked a broken migration.
* Test files use `*.test.ts` adjacent to the source. Shared test utilities use the `_` prefix convention (e.g., `_use-bun-mock.ts`).
* Run `bun test` before pushing.

See [Testing](testing.md) for the full patterns.

## Errors

* Use `BrikaError` for typed errors that cross IPC or HTTP. Plain `Error` for internal, throwaway exceptions.
* Don't swallow errors silently. If you catch and ignore, leave a comment with the rationale.

## Logging

* `log.{debug,info,warn,error}` from `@brika/sdk` in plugins; the hub's `Logger` service elsewhere.
* Don't log secrets, even at debug level. Use the redaction options when in doubt.

## Pre-push

Before every `git push`:

```sh
bun run lint
bun run typecheck
bun test
```

The trio. Lint catches the most surprises, typecheck the second most, tests the rest.

## Commits

* Use Conventional Commits (`fix:`, `feat:`, `chore:`, etc.).
* SSH-signed commits are required by the repo's ruleset.
* Never `--no-verify` or `--no-gpg-sign` unless explicitly required.

## See also

* **[Development Setup](development.md)** — running the trio locally.
* **[Testing](testing.md)** — test patterns.
* **[Release Process](release.md)** — what happens after the trio passes.
