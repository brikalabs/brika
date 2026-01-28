---
name: test
description: Write or improve tests following project testing conventions and industry best practices. Use when writing new tests, reviewing test code, or when asked to add test coverage.
argument-hint: [file or component to test]
---

# Test Writing Guidelines

Write or improve tests for: $ARGUMENTS

## Core Principles

### FIRST Principles
Tests should be:
- **Fast**: Execute in milliseconds for instant feedback
- **Isolated**: No dependencies between tests, no shared state
- **Repeatable**: Same result every time, deterministic
- **Self-validating**: Pass or fail without manual inspection
- **Timely**: Written alongside or before the code

### AAA Pattern (Arrange-Act-Assert)
Structure every test with three visually distinct sections separated by blank lines:

```typescript
test('should calculate total with discount', () => {
  const cart = createCart([{ price: 100, qty: 2 }]);
  const discount = 0.1;

  const total = cart.calculateTotal(discount);

  expect(total).toBe(180);
});
```

- **Arrange**: Setup test data and dependencies (first block)
- **Act**: Execute the unit under test - usually 1 line (second block)
- **Assert**: Verify the result - usually 1 line (third block)

---

## Test Definition

- Use `test()` over `it()` for test definitions
- Import from `bun:test`: `import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'`

---

## Test Fixtures

Extract common setup into reusable fixture functions with sensible defaults:

```typescript
// Factory functions with optional customization
const createTestFlow = <T>(): { flow: FlowImpl<T>; cleanup: CleanupRegistry } => {
  const cleanup = new CleanupRegistry();
  const flow = new FlowImpl<T>(setTimeoutFn, cleanup);
  return { flow, cleanup };
};

// Value collectors for subscription testing
const createValueCollector = <T>(): { values: T[]; subscriber: (v: T) => void } => {
  const values: T[] = [];
  return { values, subscriber: (v: T) => values.push(v) };
};

// Mock emitters with captured values
const createMockEmitter = <T>(): Emitter<T> & { emitted: T[] } => {
  const emitted: T[] = [];
  return { emit: (v: T) => emitted.push(v), emitted };
};
```

---

## TestBed (Dependency Injection Testing)

Use `@brika/di/testing` for service testing with automatic mocking.

### Quick Start with `useTestBed` (Recommended)

```typescript
import { useTestBed } from '@brika/di/testing';

const di = useTestBed(); // Auto-resets after each test

describe('MyService', () => {
  test('does something', () => {
    const eventSpy = mock();
    di.stub(Logger);
    di.stub(EventBus, { emit: eventSpy });
    di.provide(Config, { port: 3001, host: 'localhost' });

    const service = di.inject(MyService);
    service.doSomething();

    expect(eventSpy).toHaveBeenCalled();
  });
});
```

### Manual Lifecycle with `TestBed`

For more control over setup/teardown:

```typescript
import { TestBed } from '@brika/di/testing';

describe('MyService', () => {
  beforeEach(() => {
    TestBed.stub(Logger);
    TestBed.stub(EventBus, { emit: eventSpy });
    TestBed.provide(Config, { port: 3001, host: 'localhost' });
  });

  afterEach(() => TestBed.reset());

  test('does something', () => {
    const service = TestBed.inject(MyService);

    service.doSomething();

    expect(eventSpy).toHaveBeenCalled();
  });
});
```

- `stub()` creates a deep proxy that no-ops all methods
- `stub(Token, overrides)` merges partial overrides with auto-stubbed methods
- `useTestBed()` auto-handles `reset()` in `afterEach()`

**TestBed API:**
| Method | Purpose |
|--------|---------|
| `useTestBed()` | Hook-style helper with auto lifecycle (recommended) |
| `di.stub<T>(token, overrides?)` | Create auto-mocking proxy with optional overrides |
| `di.provide<T>(token, value)` | Register a mock/partial value |
| `di.inject<T>(token)` / `di.get<T>(token)` | Resolve service from container |
| `TestBed.reset()` | Reset container (manual only) |

---

## BunMock (Bun API Mocking)

Use `@brika/testing` for mocking Bun APIs (file system, spawn, glob, etc.):

### Quick Start with `useBunMock` (Recommended)

```typescript
import { useBunMock } from '@brika/testing';

const bun = useBunMock(); // Auto-restores after each test

describe('MyService', () => {
  test('reads config file', async () => {
    bun.fs({
      '/app/config.json': { port: 3000 },
      '/app/locales/en/common.json': { greeting: 'Hello' },
    }).apply();

    const config = await Bun.file('/app/config.json').json();
    expect(config.port).toBe(3000);
  });

  test('spawns a process', async () => {
    bun.spawn({ exitCode: 0, stderr: 'Installing...' }).apply();

    const proc = Bun.spawn(['bun', 'install']);
    expect(await proc.exited).toBe(0);
    expect(bun.spawnCalls[0]?.cmd).toEqual(['bun', 'install']);
  });
});
```

**BunMock API:**
| Method | Purpose |
|--------|---------|
| `useBunMock()` | Hook-style helper with auto lifecycle (recommended) |
| `bun.fs(tree)` | Define virtual filesystem from object tree |
| `bun.file(path, content)` | Add a single file |
| `bun.directory(path, entries)` | Add a directory with entries |
| `bun.spawn(config)` | Configure spawn mock (`exitCode`, `stdout`, `stderr`) |
| `bun.resolve(pkg, path)` | Mock package resolution |
| `bun.apply()` | Apply all mocks to Bun globals |
| `bun.hasFile(path)` / `bun.getFile(path)` | Query virtual filesystem |
| `bun.spawnCalls` | Array of recorded spawn calls |

---

## TestApp (Route Testing)

Use `@brika/router/testing` for testing HTTP routes without starting a real server:

```typescript
import { useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';

const di = useTestBed();

describe('health routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  beforeEach(() => {
    di.stub(PluginManager);
    di.stub(BlockRegistry);
    app = TestApp.create(healthRoutes);
  });

  test('GET /api/health returns ok', async () => {
    const res = await app.get<{ ok: boolean }>('/api/health');

    expect(res.ok).toBeTrue();
    expect(res.body.ok).toBeTrue();
  });

  test('POST /api/users creates user', async () => {
    const res = await app.post<{ id: string }>('/api/users', { name: 'John' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  test('DELETE /api/users/:id deletes user', async () => {
    const res = await app.delete('/api/users/123');

    expect(res.ok).toBeTrue();
  });
});
```

**TestApp API:**
| Method | Purpose |
|--------|---------|
| `TestApp.create(routes)` | Create test app from route definitions |
| `app.get<T>(path, options?)` | Make GET request |
| `app.post<T>(path, body?, options?)` | Make POST request |
| `app.put<T>(path, body?, options?)` | Make PUT request |
| `app.patch<T>(path, body?, options?)` | Make PATCH request |
| `app.delete<T>(path, options?)` | Make DELETE request |
| `app.request<T>(method, path, body?, options?)` | Make request with any HTTP method |

**Response object:**
| Property | Type | Description |
|----------|------|-------------|
| `res.status` | `number` | HTTP status code |
| `res.ok` | `boolean` | True if status is 2xx |
| `res.body` | `T` | Parsed response body (JSON or text) |
| `res.headers` | `Headers` | Response headers |
| `res.raw` | `Response` | Original Response for advanced use |

**Request options:**
```typescript
// With query parameters
const res = await app.get('/api/search', { query: { q: 'test', limit: '10' } });

// With custom headers
const res = await app.get('/api/protected', { headers: { Authorization: 'Bearer token' } });
```

---

## Matchers Reference

### Prefer Specific Matchers
| Instead of | Use |
|------------|-----|
| `.toBe(true)` | `.toBeTrue()` |
| `.toBe(false)` | `.toBeFalse()` |
| `.toBe(null)` | `.toBeNull()` |
| `.toBe(undefined)` | `.toBeUndefined()` |
| `arr.length.toBe(n)` | `.toHaveLength(n)` |
| `arr.includes(x).toBe(true)` | `.toContain(x)` |

### Available Matchers
- **Boolean**: `.toBeTrue()`, `.toBeFalse()`, `.toBeTruthy()`, `.toBeFalsy()`
- **Null/Undefined**: `.toBeNull()`, `.toBeUndefined()`, `.toBeDefined()`, `.toBeNaN()`
- **Equality**: `.toBe()` (reference), `.toEqual()` (deep), `.toStrictEqual()` (strict deep)
- **Arrays**: `.toHaveLength(n)`, `.toContain(item)`, `.toContainEqual(obj)`, `.arrayContaining()`
- **Objects**: `.toMatchObject()`, `.toHaveProperty(path, value?)`, `.objectContaining()`
- **Strings**: `.toMatch(regex)`, `.toContain(str)`, `.stringContaining()`, `.stringMatching()`
- **Numbers**: `.toBeGreaterThan()`, `.toBeGreaterThanOrEqual()`, `.toBeLessThan()`, `.toBeLessThanOrEqual()`, `.toBeCloseTo(n, decimals)`
- **Errors**: `.toThrow()`, `.toThrow(ErrorClass)`, `.toThrow(/message/)`
- **Promises**: `.resolves.toBe()`, `.rejects.toThrow()`
- **Mocks**: `.toHaveBeenCalled()`, `.toHaveBeenCalledTimes(n)`, `.toHaveBeenCalledWith(...args)`, `.toHaveBeenLastCalledWith(...args)`

---

## Assertion Guards

Ensure assertions actually execute in async/callback tests:

```typescript
test('should emit events to all listeners', async () => {
  expect.hasAssertions();
  const events: Event[] = [];
  emitter.on('data', (e) => events.push(e));

  await emitter.emit({ type: 'test' });

  expect(events).toHaveLength(1);
});
```

- `expect.hasAssertions()` fails the test if no assertions run
- `expect.assertions(n)` fails if not exactly n assertions run

---

## Mocking with Bun

```typescript
import { mock, spyOn } from 'bun:test';

const handler = mock((x: number) => x * 2);

handler(5);

expect(handler).toHaveBeenCalledWith(5);
expect(handler.mock.calls).toHaveLength(1);
expect(handler.mock.results[0].value).toBe(10);
```

**Mock methods:**
- `mockReset()` - Clears calls and results
- `mockClear()` - Clears calls only

**Spying on methods:**
```typescript
const spy = spyOn(console, 'log');

console.log('test');

expect(spy).toHaveBeenCalledWith('test');
spy.mockRestore();
```

---

## Parametrized Testing

Use `test.each()` for multiple similar test cases:

```typescript
test.each([
  ['empty string', '', true],
  ['whitespace', '   ', true],
  ['valid input', 'hello', false],
  ['with numbers', 'test123', false],
])('isBlank(%s) should return %p', (_desc, input, expected) => {
  expect(isBlank(input)).toBe(expected);
});

// With objects for complex cases
test.each([
  { input: { a: 1 }, expected: 1 },
  { input: { a: 2, b: 3 }, expected: 5 },
])('sum($input) should be $expected', ({ input, expected }) => {
  expect(sum(input)).toBe(expected);
});
```

**Format specifiers:** `%s` (string), `%d`/`%i` (number), `%f` (float), `%p` (pretty-print), `%j` (JSON), `%o` (object), `%#` (index)

---

## Test Organization

```typescript
import { useTestBed } from '@brika/di/testing';

const di = useTestBed();

describe('ServiceName', () => {
  let service: MyService;

  beforeEach(() => {
    di.stub(Logger);
    service = di.inject(MyService);
  });

  describe('methodName', () => {
    test('should handle normal input', () => {
      const input = createValidInput();

      const result = service.methodName(input);

      expect(result).toMatchObject({ success: true });
    });

    test('should reject invalid input', () => {
      const input = createInvalidInput();

      expect(() => service.methodName(input)).toThrow();
    });
  });
});
```

---

## Test Modifiers

| Modifier | Purpose |
|----------|---------|
| `test.skip()` | Skip test |
| `test.todo('description')` | Mark as TODO |
| `test.only()` | Run only this test |
| `test.if(condition)()` | Run if condition is true |
| `test.skipIf(condition)()` | Skip if condition is true |
| `test.failing()` | Expected to fail (inverted result) |

**Timeouts and retries:**
```typescript
test('slow operation', async () => { /* ... */ }, 10000);
test('flaky test', () => { /* ... */ }, { retry: 3 });
```

---

## Best Practices Checklist

- [ ] One behavior per test (single assertion focus)
- [ ] Descriptive test names: "should [expected behavior] when [condition]"
- [ ] AAA pattern with clear separation
- [ ] No test interdependencies
- [ ] Use `useTestBed()` for auto-cleanup
- [ ] `expect.hasAssertions()` for async tests
- [ ] Fixtures for reusable test data
- [ ] `useTestBed()` for DI-based services
- [ ] Specific matchers over generic `.toBe()`
- [ ] `test.each()` for repetitive test cases
