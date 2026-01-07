# @brika/flow

Reactive flow primitives for event-driven programming in BRIKA. Type-safe, composable streams with automatic cleanup.

## Features

- **Reactive streams** - Push-based event flows
- **Type-safe** - Full TypeScript inference through pipelines
- **Composable** - Chain operators with `pipe()`
- **Auto-cleanup** - Resources cleaned up on dispose
- **Lightweight** - Zero dependencies, ~5KB

## Installation

```bash
npm install @brika/flow
```

## Usage

### Creating Flows

```typescript
import { createFlow, interval, timer } from '@brika/flow';

// Manual flow
const clicks = createFlow<MouseEvent>();
element.addEventListener('click', (e) => clicks.emit(e));

// Built-in sources
const ticks = start(interval(1000));  // Emits 0, 1, 2, ... every second
const once = start(timer(5000));      // Emits 0 after 5 seconds
```

### Subscribing to Flows

```typescript
import { createFlow } from '@brika/flow';

const numbers = createFlow<number>();

// Subscribe with callback
numbers.on((n) => console.log(n));

// Pipe to another flow
numbers.to(otherFlow);

// Get cleanup function
const unsub = numbers.on((n) => console.log(n));
unsub(); // Stop listening
```

### Operators

Transform flows with chainable operators:

```typescript
import { createFlow, map, filter, debounce, take } from '@brika/flow';

const input = createFlow<string>();

input
  .pipe(
    filter((s) => s.length > 0),
    map((s) => s.toUpperCase()),
    debounce(300),
    take(10)
  )
  .on((s) => console.log(s));
```

### Available Operators

#### Transform

| Operator | Description |
|----------|-------------|
| `map(fn)` | Transform each value |
| `filter(fn)` | Only emit values passing predicate |
| `tap(fn)` | Side effect without transforming |
| `scan(fn, seed)` | Accumulate values (like reduce) |

#### Timing

| Operator | Description |
|----------|-------------|
| `debounce(ms)` | Wait for silence before emitting |
| `throttle(ms)` | Rate limit emissions |
| `delay(ms)` | Delay each value |

#### Control

| Operator | Description |
|----------|-------------|
| `take(n)` | Take first N values |
| `skip(n)` | Skip first N values |
| `distinct()` | Only emit when value changes |

#### Advanced

| Operator | Description |
|----------|-------------|
| `buffer(trigger)` | Collect values until trigger fires |
| `sample(trigger)` | Emit latest value when trigger fires |
| `switchMap(fn)` | Switch to new flow on each value |
| `flatMap(fn)` | Flatten nested flows |

### Combinators

Combine multiple flows:

```typescript
import { combine, merge, createFlow } from '@brika/flow';

const a = createFlow<number>();
const b = createFlow<string>();

// Combine latest values (emits when both have values)
combine(a, b).on(([num, str]) => {
  console.log(num, str);
});

// Merge into single flow
merge(a.pipe(map(String)), b).on((str) => {
  console.log(str);
});
```

### Sources

Create flows from common patterns:

```typescript
import { interval, timer, start } from '@brika/flow';

// Interval - emits 0, 1, 2, ... every N ms
const ticks = start(interval(1000));

// Timer - emits 0 once after N ms
const delayed = start(timer(5000));

// Custom source
const custom = start({
  __source: true,
  start: (emit) => {
    const id = setInterval(() => emit(Date.now()), 100);
    return () => clearInterval(id);
  }
});
```

### Cleanup

Flows automatically clean up when disposed:

```typescript
import { createFlow, interval, start } from '@brika/flow';

const flow = createFlow<number>();

// All subscriptions cleaned up
flow.dispose();

// Sources clean up their resources
const ticks = start(interval(1000));
ticks.dispose(); // Clears the interval
```

## API Reference

### Flow<T>

```typescript
interface Flow<T> {
  // Subscribe to values
  on(callback: (value: T) => void): Cleanup;
  
  // Pipe through operators
  pipe<R>(...ops: Operator[]): Flow<R>;
  
  // Connect to another flow
  to(target: Flow<T>): Cleanup;
  
  // Emit a value (for writable flows)
  emit(value: T): void;
  
  // Clean up all subscriptions
  dispose(): void;
}
```

### Operator<In, Out>

```typescript
type Operator<In, Out> = (source: Flow<In>) => Flow<Out>;
```

### Source<T>

```typescript
interface Source<T> {
  __source: true;
  start: (emit: (value: T) => void) => Cleanup;
}
```

## Examples

### Debounced Search

```typescript
import { createFlow, debounce, filter, switchMap, map } from '@brika/flow';

const searchInput = createFlow<string>();

searchInput
  .pipe(
    debounce(300),
    filter((q) => q.length >= 2),
    switchMap((query) => fetchResults(query))
  )
  .on((results) => renderResults(results));
```

### Rate-Limited API Calls

```typescript
import { createFlow, throttle, tap } from '@brika/flow';

const apiCalls = createFlow<Request>();

apiCalls
  .pipe(
    throttle(1000), // Max 1 call per second
    tap(() => showLoading())
  )
  .on(async (req) => {
    const res = await fetch(req);
    hideLoading();
  });
```

### Combining Sensor Data

```typescript
import { combine, map, interval, start } from '@brika/flow';

const temperature = createFlow<number>();
const humidity = createFlow<number>();

combine(temperature, humidity)
  .pipe(
    map(([temp, hum]) => ({
      comfort: calculateComfort(temp, hum),
      timestamp: Date.now(),
    }))
  )
  .on((data) => updateDashboard(data));
```

## License

MIT

