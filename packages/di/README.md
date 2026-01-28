# @brika/di

Dependency injection utilities for Brika, built on top of [tsyringe](https://github.com/microsoft/tsyringe).

## Installation

```bash
bun add @brika/di
```

## Usage

### Core DI

```typescript
import { container, inject, injectable, singleton } from '@brika/di';
```

#### Decorators

Use `@injectable()` or `@singleton()` to mark classes for dependency injection:

```typescript
import { injectable, singleton } from '@brika/di';

@injectable()
class UserService {
  getUser(id: string) { /* ... */ }
}

@singleton()
class ConfigService {
  readonly port = 3000;
}
```

#### Property Injection

Use `inject()` as a property initializer (Angular-style):

```typescript
import { inject } from '@brika/di';

@injectable()
class UserController {
  private readonly users = inject(UserService);
  private readonly config = inject(ConfigService);

  getUser(id: string) {
    return this.users.getUser(id);
  }
}
```

#### Container Access

Direct container access when needed:

```typescript
import { container } from '@brika/di';

// Resolve a service
const userService = container.resolve(UserService);

// Register an instance
container.registerInstance(ConfigService, myConfig);
```

## Testing

```typescript
import { useTestBed } from '@brika/di/testing';
```

### Quick Start with `useTestBed`

The simplest way to mock dependencies - lifecycle is handled automatically:

```typescript
import { useTestBed } from '@brika/di/testing';
import { mock } from 'bun:test';

describe('UserController', () => {
  const di = useTestBed(); // Auto afterEach reset

  test('gets user', () => {
    di.stub(Logger);
    di.stub(UserService, {
      getUser: mock().mockReturnValue({ id: '1', name: 'Test' })
    });

    const controller = di.get(UserController);
    expect(controller.getUser('1').name).toBe('Test');
  });
});
```

### Manual Lifecycle with `TestBed`

For more control over setup/teardown:

```typescript
import { TestBed } from '@brika/di/testing';
import { mock } from 'bun:test';

describe('UserController', () => {
  beforeEach(() => {
    // Auto-stub: creates deep mock that returns stubs for all methods
    TestBed.stub(Logger);

    // With overrides: auto-stub but override specific methods
    TestBed.stub(UserService, {
      getUser: mock().mockReturnValue({ id: '1', name: 'Test' })
    });

    // Manual provide for full control
    TestBed.provide(ConfigService, { port: 3001 });
  });

  afterEach(() => TestBed.reset());

  test('gets user', () => {
    const controller = TestBed.inject(UserController);
    const user = controller.getUser('1');
    expect(user.name).toBe('Test');
  });
});
```

### Deep Stubs

`TestBed.stub()` creates proxy-based stubs that auto-mock all properties and methods:

```typescript
// All methods auto-stubbed, returns nested stubs for chaining
TestBed.stub(Logger);

const logger = TestBed.inject(Logger);
logger.info('test');                    // no-op
logger.withSource('hub').info('test');  // also works
```

Partial overrides merge with auto-stubs:

```typescript
const errors: string[] = [];

TestBed.stub(Logger, {
  withSource: () => ({
    error: (msg: string) => errors.push(msg)
    // info, warn, debug are auto-stubbed
  })
});
```

### createDeepStub

For standalone use without TestBed:

```typescript
import { createDeepStub } from '@brika/di/testing';

const stub = createDeepStub<Logger>({
  error: (msg) => console.log(msg)
});

stub.info('test');   // no-op
stub.error('oops');  // logs 'oops'
```

## Package Structure

```
src/
├── index.ts              # Main exports
├── core/
│   ├── index.ts          # Core re-exports
│   ├── container.ts      # DI container with hot reload support
│   └── inject.ts         # inject() function
└── testing/
    ├── index.ts          # Testing re-exports
    ├── test-bed.ts       # TestBed singleton
    ├── use-test-bed.ts   # useTestBed() hook
    ├── deep-stub.ts      # createDeepStub factory
    └── types.ts          # Type definitions
```

## Hot Reload Support

The container persists across module reloads (useful for development with tools like Bun's `--watch`). Singletons remain instantiated between reloads.

## API Reference

### Core

| Export | Description |
|--------|-------------|
| `container` | The DI container instance |
| `inject<T>(token)` | Resolve a dependency (property initializer) |
| `@injectable()` | Mark a class as injectable |
| `@singleton()` | Mark a class as a singleton |

### Testing

| Export | Description |
|--------|-------------|
| `useTestBed()` | Hook-style helper with auto lifecycle (recommended) |
| `TestBed.stub(token, overrides?)` | Create and register a deep stub |
| `TestBed.provide(token, value)` | Register a mock value |
| `TestBed.inject(token)` | Resolve from test container |
| `TestBed.get(token)` | Alias for inject |
| `TestBed.reset()` | Reset container for next test |
| `createDeepStub<T>(overrides?)` | Create a standalone deep stub |

### Types

| Type | Description |
|------|-------------|
| `Constructor<T>` | Constructor type for DI tokens |
| `DeepPartial<T>` | Nested partial type for overrides |
| `DependencyContainer` | Container type from tsyringe |
| `InjectionToken<T>` | Token type for injection |
