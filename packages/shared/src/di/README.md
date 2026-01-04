# ELIA Testing Utilities

Modern, ergonomic testing utilities for dependency injection. Inspired by Vitest, Jest, Angular TestBed, and NestJS.

## Quick Start

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TestBed, spy, mock } from "@elia/shared";
import { MyService } from "./my-service";
import { LogRouter } from "./log-router";

describe("MyService", () => {
  beforeEach(() => {
    TestBed.create()
      .mock(LogRouter, {
        info: spy(),
        error: spy(),
      })
      .compile();
  });

  afterEach(() => TestBed.reset());

  it("should do something", () => {
    const service = TestBed.get(MyService);
    service.doSomething();
    
    expect(TestBed.get(LogRouter).info).toHaveBeenCalled();
  });
});
```

## API Reference

### `spy<TArgs, TReturn>(impl?)`

Create a spy function with Vitest/Jest-like API.

```typescript
// Basic spy
const fn = spy();

// Typed spy
const fn = spy<[string, number], boolean>();

// With initial implementation
const fn = spy((a, b) => a + b);
```

#### Methods

| Method                         | Description                    |
|--------------------------------|--------------------------------|
| `mockReturnValue(value)`       | Set return value for all calls |
| `mockReturnValueOnce(value)`   | Set return value once (queued) |
| `mockImplementation(fn)`       | Set implementation function    |
| `mockImplementationOnce(fn)`   | Set implementation once        |
| `mockResolvedValue(value)`     | For async: resolve with value  |
| `mockResolvedValueOnce(value)` | For async: resolve once        |
| `mockRejectedValue(error)`     | For async: reject with error   |
| `mockRejectedValueOnce(error)` | For async: reject once         |
| `reset()`                      | Clear all call history         |
| `calledWith(...args)`          | Check if called with args      |
| `nthCall(n)`                   | Get call at index n            |

#### Properties

| Property    | Description                  |
|-------------|------------------------------|
| `calls`     | Array of all call arguments  |
| `callCount` | Number of times called       |
| `called`    | Whether called at least once |
| `lastCall`  | Last call arguments          |
| `firstCall` | First call arguments         |

#### Examples

```typescript
// Mock return values
const fn = spy<[], number>();
fn.mockReturnValueOnce(1)
  .mockReturnValueOnce(2)
  .mockReturnValue(999);

fn(); // 1
fn(); // 2
fn(); // 999
fn(); // 999

// Mock async
const fetchUser = spy<[string], Promise<User>>();
fetchUser.mockResolvedValue({ id: "1", name: "John" });

await fetchUser("1"); // { id: "1", name: "John" }

// Check calls
fn("hello", 42);
fn("world", 100);

expect(fn.callCount).toBe(2);
expect(fn.calledWith("hello", 42)).toBe(true);
expect(fn.lastCall).toEqual(["world", 100]);
```

### `mock<T>(overrides)`

Create a partial mock with type safety.

```typescript
interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

const logger = mock<Logger>({
  info: spy(),
  error: spy(),
});

logger.info("test");
expect(logger.info.called).toBe(true);
```

### `autoMock<T>(methodNames)`

Auto-generate a mock with all specified methods as spies.

```typescript
interface Service {
  method1(): string;
  method2(n: number): number;
}

const service = autoMock<Service>(["method1", "method2"]);

service.method1();
service.method2(42);

expect(service.method1.called).toBe(true);
expect(service.method2.lastCall).toEqual([42]);
```

### `TestBed`

Fluent DI testing container.

#### Setup Pattern

```typescript
// Modern fluent API
TestBed.create()
  .mock(LogRouter, { info: spy(), error: spy() })
  .provide(HubConfig, new HubConfig())
  .compile();

// Get services
const service = TestBed.get(MyService);

// Reset after each test
TestBed.reset();
```

#### Methods

| Method                       | Description                  |
|------------------------------|------------------------------|
| `create()`                   | Start building a test module |
| `mock(token, value)`         | Provide a partial mock       |
| `provide(token, value)`      | Provide a complete value     |
| `useClass(token, impl)`      | Use different implementation |
| `useFactory(token, factory)` | Use factory function         |
| `compile()`                  | Finalize and register        |
| `get(token)`                 | Get service from container   |
| `inject(token)`              | Alias for get()              |
| `reset()`                    | Reset container              |

## Testing Patterns

### Testing Event Handlers

```typescript
it("should handle events", () => {
  const handler = spy<[EliaEvent]>();
  
  const bus = TestBed.get(EventBus);
  bus.subscribe("motion.*", handler);
  
  bus.emit("motion.detected", "sensor", { room: "living" });
  bus.emit("motion.stopped", "sensor", { room: "living" });
  
  expect(handler.callCount).toBe(2);
  expect(handler.nthCall(0)?.[0].type).toBe("motion.detected");
});
```

### Testing Async Operations

```typescript
it("should call tools", async () => {
  const toolHandler = spy<[object, object], Promise<ToolResult>>();
  toolHandler.mockResolvedValue({ ok: true, content: "done" });
  
  registry.register({
    name: "light.on",
    owner: "hue",
    call: toolHandler,
  });
  
  const result = await registry.call("light.on", { brightness: 80 }, ctx);
  
  expect(result.ok).toBe(true);
  expect(toolHandler.lastCall?.[0]).toEqual({ brightness: 80 });
});
```

### Testing Error Handling

```typescript
it("should handle errors gracefully", () => {
  const errorSpy = spy<[string, object?]>();
  
  TestBed.create()
    .mock(LogRouter, { error: errorSpy })
    .compile();
  
  const bus = TestBed.get(EventBus);
  bus.subscribe("test", () => { throw new Error("boom"); });
  
  expect(() => bus.emit("test", "src", null)).not.toThrow();
  expect(errorSpy.called).toBe(true);
});
```

### Testing with Sequential Return Values

```typescript
it("should handle retry logic", async () => {
  const fetch = spy<[], Promise<Response>>();
  
  fetch
    .mockRejectedValueOnce(new Error("Network error"))
    .mockRejectedValueOnce(new Error("Timeout"))
    .mockResolvedValue({ ok: true });
  
  const result = await retryFetch(fetch, { maxRetries: 3 });
  
  expect(result.ok).toBe(true);
  expect(fetch.callCount).toBe(3);
});
```



