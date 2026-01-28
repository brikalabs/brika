# @brika/testing

Testing utilities for mocking Bun APIs in tests.

## Installation

```bash
bun add -d @brika/testing
```

## Usage

### Quick Start with `useBunMock`

The simplest way to mock Bun APIs - lifecycle is handled automatically:

```typescript
import { useBunMock } from '@brika/testing';
import { describe, test, expect } from 'bun:test';

describe('MyService', () => {
  const bun = useBunMock(); // Auto beforeEach/afterEach

  test('reads config file', async () => {
    bun
      .fs({
        '/app/config.json': { port: 3000 },
        '/app/locales/en/common.json': { greeting: 'Hello' },
      })
      .apply();

    const config = await Bun.file('/app/config.json').json();
    expect(config.port).toBe(3000);
  });
});
```

### Manual Lifecycle with `mockBun`

For more control over setup/teardown:

```typescript
import { mockBun, type BunMock } from '@brika/testing';
import { afterEach, beforeEach, describe, test } from 'bun:test';

describe('MyService', () => {
  let bun: BunMock;

  beforeEach(() => {
    bun = mockBun();
  });

  afterEach(() => {
    bun.restore();
  });

  test('reads config file', async () => {
    bun.fs({ '/app/config.json': { port: 3000 } }).apply();
    // ...
  });
});
```

### Virtual Filesystem

The `fs()` method creates a virtual filesystem. Directory structure is **automatically inferred** from file paths:

```typescript
// Just define files - directories are created automatically
bun.fs({
  '/app/config.json': { port: 3000 },
  '/app/locales/en/common.json': { greeting: 'Hello' },
  '/app/locales/fr/common.json': { bonjour: 'Bonjour' },
}).apply();

// Glob scanning works automatically
const locales = await Array.fromAsync(
  new Bun.Glob('*/').scan({ cwd: '/app/locales' })
);
// → ['en/', 'fr/']
```

#### Explicit Directories

For ordering or empty directories, use explicit directory syntax (keys ending with `/`):

```typescript
bun.fs({
  // Explicit order
  '/locales/': ['fr/', 'en/', 'de/'],

  // Empty directory
  '/locales/de/': [],

  // Files
  '/locales/en/common.json': { hello: 'Hello' },
  '/locales/fr/common.json': { bonjour: 'Bonjour' },
}).apply();
```

### Individual Methods

For granular control:

```typescript
// Add single file
bun.file('/config.json', { port: 3000 });

// Add directory with entries
bun.directory('/locales', ['en/', 'fr/']);

// Configure spawn mock
bun.spawn({ exitCode: 0, stderr: 'Success' });

// Mock package resolution
bun.resolve('@test/plugin', '/node_modules/@test/plugin/index.js');

// Apply all mocks
bun.apply();
```

### Spawn Mocking

Mock `Bun.spawn()` with configurable exit codes and output:

```typescript
bun
  .spawn({ exitCode: 0, stderr: 'Installing packages...' })
  .apply();

const proc = Bun.spawn(['bun', 'install']);
await proc.exited; // → 0

// Access recorded calls
expect(bun.spawnCalls).toHaveLength(1);
expect(bun.spawnCalls[0]?.cmd).toEqual(['bun', 'install']);

// Clear call history
bun.clearSpawnCalls();
```

### Package Resolution

Mock `Bun.resolveSync()`:

```typescript
bun
  .resolve('@test/plugin', '/node_modules/@test/plugin/index.js')
  .apply();

Bun.resolveSync('@test/plugin', '/'); // → '/node_modules/@test/plugin/index.js'
Bun.resolveSync('@unknown/pkg', '/'); // throws 'Cannot resolve'
```

### Querying Virtual Filesystem

Check and retrieve files from the virtual filesystem:

```typescript
bun.file('/data.json', { items: [1, 2, 3] }).apply();

// After writes, verify file state
await Bun.write('/output.json', JSON.stringify({ result: true }));

bun.hasFile('/output.json'); // → true
bun.getFile('/output.json'); // → { result: true }
```

## API Reference

### Factory Functions

| Export | Description |
|--------|-------------|
| `useBunMock()` | Hook-style helper with auto lifecycle (recommended) |
| `mockBun()` | Create a new BunMock instance (manual lifecycle) |
| `proxify(fn)` | Create proxy that delegates to lazily-resolved instance |

### BunMock Methods

| Method | Description |
|--------|-------------|
| `fs(tree)` | Define virtual filesystem from object tree |
| `file(path, content)` | Add a single file |
| `directory(path, entries)` | Add a directory with entries |
| `spawn(config)` | Configure spawn mock (`exitCode`, `stdout`, `stderr`) |
| `resolve(pkg, path)` | Mock package resolution |
| `apply()` | Apply all mocks to Bun globals |
| `restore()` | Restore original Bun APIs and clear state |
| `hasFile(path)` | Check if file exists in virtual fs |
| `getFile(path)` | Get file content from virtual fs |
| `clearSpawnCalls()` | Clear recorded spawn calls |

### BunMock Properties

| Property | Description |
|----------|-------------|
| `spawnCalls` | Array of recorded `Bun.spawn()` calls |

## Mocked APIs

- `Bun.file()` - File reading (`exists()`, `json()`, `text()`)
- `Bun.write()` - File writing (updates virtual fs)
- `Bun.spawn()` - Process spawning with configurable output
- `Bun.resolveSync()` - Package resolution
- `Bun.Glob` - Directory scanning (`scan()`, `scanSync()`, `match()`)

## Utilities

### `proxify`

Create hook-style test helpers with lazy instance resolution:

```typescript
import { proxify } from '@brika/testing';
import { beforeEach } from 'bun:test';

function useMyService(): MyService {
  let current: MyService;

  beforeEach(() => {
    current = new MyService();
  });

  return proxify(() => current);
}

// Usage
describe('test', () => {
  const service = useMyService();

  test('works', () => {
    service.doSomething(); // Delegates to current instance
  });
});
```

## Package Structure

```
src/
├── index.ts       # Main exports
├── mock-bun.ts    # BunMock implementation
└── proxify.ts     # Proxy helper for hook-style utilities
```
