# Testing Best Practices

This document outlines the testing standards and best practices used in this project, based on [Bun's testing documentation](https://bun.com/docs/test/writing-tests).

## Core Principles

### 1. Test Definition

✅ **Use `test()` over `it()`**
```typescript
// Good
test('should start workflow successfully', async () => {
  // ...
});

// Avoid
it('should start workflow successfully', async () => {
  // ...
});
```

### 2. Test Fixtures

✅ **Extract common test data into reusable fixtures**
```typescript
// Good - Reusable fixtures
const createSimpleWorkflow = (id = 'test-workflow'): Workflow => ({
  id,
  name: `Workflow ${id}`,
  enabled: true,
  blocks: [{ id: 'block-1', type: 'timer' }],
  connections: [],
});

test('should start workflow', async () => {
  const workflow = createSimpleWorkflow();
  await executor.start(workflow);
  expect(executor.isRunning).toBeTrue();
});

// Avoid - Repeated boilerplate
test('should start workflow', async () => {
  const workflow = {
    id: 'test-workflow',
    name: 'Test Workflow',
    enabled: true,
    blocks: [{ id: 'block-1', type: 'timer' }],
    connections: [],
  };
  await executor.start(workflow);
  expect(executor.isRunning).toBe(true);
});
```

**Benefits:**
- Reduces 100+ lines of repetitive setup code
- Makes tests more maintainable
- Easier to update test data structure

### 3. Specific Matchers

✅ **Use specific matchers that communicate intent clearly**

```typescript
// Good - Specific matchers
expect(result).toBeTrue();
expect(value).toBeFalse();
expect(obj).toBeNull();
expect(arr).toHaveLength(5);
expect(arr).toContain('item');
expect(obj).toMatchObject({ key: 'value' });

// Avoid - Generic matchers
expect(result).toBe(true);
expect(value).toBe(false);
expect(obj).toBe(null);
expect(arr.length).toBe(5);
expect(arr.includes('item')).toBe(true);
```

**Available Matchers:**
- **Boolean**: `.toBeTrue()`, `.toBeFalse()`, `.toBeTruthy()`, `.toBeFalsy()`
- **Null/Undefined**: `.toBeNull()`, `.toBeUndefined()`, `.toBeDefined()`
- **Arrays**: `.toHaveLength(n)`, `.toContain(item)`, `.arrayContaining()`
- **Objects**: `.toMatchObject()`, `.toHaveProperty()`, `.objectContaining()`
- **Numbers**: `.toBeGreaterThan()`, `.toBeLessThan()`, `.toBeCloseTo()`
- **Promises**: `.resolves`, `.rejects`

### 4. Assertion Guards

✅ **Use `expect.hasAssertions()` in async tests**
```typescript
// Good - Ensures assertions execute
test('should notify listeners', async () => {
  expect.hasAssertions();
  const events: Event[] = [];
  executor.addListener((e) => events.push(e));

  await executor.start(workflow);

  expect(events.length).toBeGreaterThan(0);
  expect(events[0]?.type).toBe('workflow.started');
});

// Risky - Assertions might not run if promise rejects early
test('should notify listeners', async () => {
  const events: Event[] = [];
  executor.addListener((e) => events.push(e));

  await executor.start(workflow);

  expect(events.length).toBeGreaterThan(0);
});
```

**Also available:**
- `expect.assertions(n)` - Verify exact assertion count

### 5. Parametrized Testing

✅ **Use `test.each()` for multiple test cases**
```typescript
// Good - Single test definition, multiple cases
test.each([
  ['string value', 'port1', 'string'],
  ['number value', 'port2', 123],
  ['boolean value', 'port3', true],
  ['null value', 'port4', null],
  ['nested object', 'port5', { nested: { data: [1, 2, 3] } }],
])('should inject %s successfully', async (_description, port, data) => {
  expect.hasAssertions();
  const workflow = createSimpleWorkflow();
  await executor.start(workflow);

  const result = executor.inject('block-1', port, data);

  expect(result).toBeTrue();
  expect(injectedData).toContainEqual({ blockId: 'block-1', port, data });
});

// Avoid - Repeated test code
test('should inject string', async () => { /* ... */ });
test('should inject number', async () => { /* ... */ });
test('should inject boolean', async () => { /* ... */ });
test('should inject null', async () => { /* ... */ });
test('should inject object', async () => { /* ... */ });
```

**Format specifiers:**
- `%s` - String
- `%i` - Integer
- `%p` - Pretty-print
- `%#` - Test index

### 6. Test Descriptions

✅ **Write clear, specific test descriptions**
```typescript
// Good - Clear what's being tested
test('should start a workflow with multiple blocks successfully', async () => {
  // ...
});

test('should reject injection into non-existent block', async () => {
  // ...
});

test('should handle duplicate block registration gracefully', () => {
  // ...
});

// Avoid - Vague or unclear
test('it works', async () => {
  // ...
});

test('should handle error', async () => {
  // ... what error?
});
```

### 7. Test Organization

✅ **Group related tests with clear structure**
```typescript
describe('WorkflowExecutor - Lifecycle', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test('should start workflow', async () => { /* ... */ });
  test('should stop workflow', async () => { /* ... */ });
});

describe('WorkflowExecutor - Data Injection', () => {
  // ... related tests
});
```

## Advanced Features

### Test Modifiers

```typescript
// Skip tests
test.skip('not yet implemented', () => {
  // ...
});

// Mark as TODO
test.todo('implement feature X');

// Run only specific tests
test.only('debug this test', () => {
  // ...
});

// Conditional execution
test.if(process.platform === 'darwin')('macOS only', () => {
  // ...
});

// Skip conditionally
test.skipIf(process.env.CI)('skip in CI', () => {
  // ...
});
```

### Timeouts

```typescript
// Default timeout: 5000ms
test('quick test', () => {
  // ...
});

// Custom timeout
test('long running test', async () => {
  // ...
}, 10000); // 10 seconds
```

### Retries

```typescript
// Retry flaky tests
test('flaky test', () => {
  // ...
}, {
  retry: 3 // Retry up to 3 times on failure
});
```

## Project-Specific Patterns

### Workflow Tests

```typescript
// Use fixtures
const createSimpleWorkflow = (id = 'test-workflow'): Workflow => ({ /* ... */ });
const createMultiBlockWorkflow = (): Workflow => ({ /* ... */ });
const createConnectedWorkflow = (): Workflow => ({ /* ... */ });

// Clean up properly
afterEach(() => {
  if (executor.isRunning) {
    executor.stop();
  }
});
```

### Block Registry Tests

```typescript
// Use TestBed for DI
beforeEach(() => {
  TestBed.create()
    .provide(Logger, { /* mock */ })
    .compile();
  registry = TestBed.inject(BlockRegistry);
});

afterEach(() => {
  TestBed.reset();
});

// Use fixtures
const createBasicBlock = (id = 'test-block'): BlockDefinition => ({ /* ... */ });
const createPlugin = (id = 'test-plugin'): PluginInfo => ({ /* ... */ });
```

## Coverage

Run coverage analysis:
```bash
bun run test:coverage
```

Coverage output:
- `coverage/lcov.info` - For SonarCloud integration
- Text summary in terminal

**Target:** 80%+ coverage on core business logic

## References

- [Bun Test Documentation](https://bun.com/docs/test/writing-tests)
- [Jest Expect API](https://jestjs.io/docs/expect) (Bun is Jest-compatible)
- Project COVERAGE_ANALYSIS.md for coverage tracking
