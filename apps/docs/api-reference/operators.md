# Reactive Operators

Complete reference for reactive operators from the `@brika/sdk` package.

## Overview

Operators transform and combine data streams in reactive blocks. They are composable and type-safe.

```typescript
import {
  // Transform
  map, filter, tap, scan,
  // Timing
  delay, debounce, throttle,
  // Control
  take, skip, distinct,
  // Combinators
  combine, merge, zip, race, all,
  // Sources
  interval, timer,
  // Advanced
  buffer, sample, switchMap, flatMap,
} from "@brika/sdk";
```

---

## Transform Operators

### map

Transform each value using a function.

```typescript
function map<T, R>(fn: (value: T) => R): Operator<T, R>
```

**Example:**

```typescript
// Convert Celsius to Fahrenheit
inputs.celsius
  .pipe(map((c) => c * 1.8 + 32))
  .to(outputs.fahrenheit);

// Extract field from object
inputs.user
  .pipe(map((user) => user.name))
  .to(outputs.name);
```

---

### filter

Only emit values that pass the predicate.

```typescript
function filter<T>(predicate: (value: T) => boolean): Operator<T, T>
```

**Example:**

```typescript
// Only emit positive numbers
inputs.value
  .pipe(filter((v) => v > 0))
  .to(outputs.positive);

// Filter by property
inputs.event
  .pipe(filter((e) => e.type === "motion"))
  .to(outputs.motion);
```

---

### tap

Execute a side effect without transforming the value.

```typescript
function tap<T>(fn: (value: T) => void): Operator<T, T>
```

**Example:**

```typescript
inputs.data
  .pipe(
    tap((d) => log.debug("Received data", { data: d })),
    map((d) => process(d))
  )
  .to(outputs.result);
```

---

### scan

Accumulate values like `Array.reduce`. Emits accumulated value after each input.

```typescript
function scan<T, R>(fn: (acc: R, value: T) => R, seed: R): Operator<T, R>
```

**Example:**

```typescript
// Running total
inputs.amount
  .pipe(scan((total, amt) => total + amt, 0))
  .to(outputs.total);

// Collect into array
inputs.item
  .pipe(scan((arr, item) => [...arr, item], []))
  .to(outputs.items);
```

---

## Timing Operators

### delay

Delay each emission by a fixed time.

```typescript
function delay<T>(ms: number): Operator<T, T>
```

**Example:**

```typescript
// Delay by 1 second
inputs.trigger
  .pipe(delay(1000))
  .to(outputs.delayed);
```

---

### debounce

Wait for silence before emitting. Only emits after no new values for the specified time.

```typescript
function debounce<T>(ms: number): Operator<T, T>
```

**Use cases:**
- Search input (wait for user to stop typing)
- Window resize events
- Form validation

**Example:**

```typescript
// Wait 300ms after last keystroke
inputs.searchQuery
  .pipe(debounce(300))
  .to(outputs.query);
```

---

### throttle

Rate limit emissions. Emit at most once per time period.

```typescript
function throttle<T>(ms: number): Operator<T, T>
```

**Use cases:**
- High-frequency sensor data
- Mouse/scroll events
- API rate limiting

**Example:**

```typescript
// Max one emission per 100ms
inputs.mousemove
  .pipe(throttle(100))
  .to(outputs.position);
```

---

## Control Operators

### take

Take only the first N values, then stop.

```typescript
function take<T>(n: number): Operator<T, T>
```

**Example:**

```typescript
// Only take first 5 values
inputs.event
  .pipe(take(5))
  .to(outputs.first5);
```

---

### skip

Skip the first N values, then emit the rest.

```typescript
function skip<T>(n: number): Operator<T, T>
```

**Example:**

```typescript
// Skip first 2 values
inputs.event
  .pipe(skip(2))
  .to(outputs.afterSkip);
```

---

### distinct

Only emit when the value is different from the previous value.

```typescript
function distinct<T>(): Operator<T, T>
```

**Example:**

```typescript
// Only emit when value changes
inputs.temperature
  .pipe(distinct())
  .to(outputs.changed);
```

---

## Combinators

### combine

Combine latest values from multiple flows. Waits for all flows to emit at least once, then emits on any change.

```typescript
function combine<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>
function combine<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>
function combine<A, B, C, D>(...flows): Flow<[A, B, C, D]>
```

**Behavior:**
- Waits for all sources to emit at least once
- Re-emits when any source emits
- Includes latest value from each source

**Example:**

```typescript
combine(inputs.temperature, inputs.humidity)
  .pipe(map(([temp, hum]) => ({
    temperature: temp,
    humidity: hum,
    heatIndex: calculateHeatIndex(temp, hum),
  })))
  .to(outputs.combined);
```

---

### merge

Merge multiple flows into one. Emits whenever any source emits.

```typescript
function merge<T>(...flows: Flow<T>[]): Flow<T>
```

**Example:**

```typescript
// Trigger on any button press
merge(inputs.button1, inputs.button2, inputs.button3)
  .to(outputs.anyButton);
```

---

### zip

Pair values from multiple flows. Waits for each flow to emit, then emits a tuple.

```typescript
function zip<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>
function zip<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>
```

**Behavior:**
- Pairs values in order (first with first, second with second)
- Buffers values until all flows have emitted

**Example:**

```typescript
zip(inputs.request, inputs.response)
  .pipe(map(([req, res]) => ({ request: req, response: res })))
  .to(outputs.pair);
```

---

### race

Emit from whichever flow emits first.

```typescript
function race<T>(...flows: Flow<T>[]): Flow<T>
```

**Example:**

```typescript
// First responder wins
race(inputs.primary, inputs.fallback)
  .to(outputs.result);
```

---

### all

Wait for all flows to emit at least once, then emit a single tuple.

```typescript
function all<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>
function all<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>
```

**Behavior:**
- Only emits once, when all flows have emitted
- Does not re-emit on subsequent values

**Example:**

```typescript
// Wait for all systems ready
all(inputs.database, inputs.cache, inputs.api)
  .pipe(map(() => ({ ready: true })))
  .to(outputs.systemReady);
```

---

## Sources

### interval

Create a source that emits incrementing numbers at regular intervals.

```typescript
function interval(ms: number): Source<number>
```

**Returns:** `0, 1, 2, 3, ...` at the specified interval.

**Example:**

```typescript
({ outputs, config, start }) => {
  start(interval(config.tickInterval))
    .pipe(map((n) => ({ tick: n + 1, timestamp: Date.now() })))
    .to(outputs.tick);
}
```

---

### timer

Create a source that emits a single value after a delay.

```typescript
function timer(ms: number): Source<number>
```

**Returns:** `0` once after the specified delay.

**Example:**

```typescript
({ outputs, config, start }) => {
  start(timer(config.delay))
    .pipe(map(() => "Timer fired!"))
    .to(outputs.message);
}
```

---

## Advanced Operators

### buffer

Collect values until a trigger emits, then emit the collected array.

```typescript
function buffer<T>(trigger: Flow<unknown>): Operator<T, T[]>
```

**Example:**

```typescript
// Collect data, flush on trigger
inputs.data
  .pipe(buffer(inputs.flush))
  .to(outputs.batch);
```

---

### sample

Emit the latest value when a trigger fires.

```typescript
function sample<T>(trigger: Flow<unknown>): Operator<T, T>
```

**Example:**

```typescript
// Sample temperature every tick
inputs.temperature
  .pipe(sample(inputs.tick))
  .to(outputs.sampled);
```

---

### switchMap

Switch to a new flow on each value. Cancels the previous inner flow.

```typescript
function switchMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R>
```

**Use cases:**
- Search autocomplete (cancel previous request)
- Navigation (cancel pending operations)

**Example:**

```typescript
inputs.searchQuery
  .pipe(switchMap((query) => fetchResults(query)))
  .to(outputs.results);
```

---

### flatMap

Flatten nested flows. Does not cancel previous inner flows.

```typescript
function flatMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R>
```

**Example:**

```typescript
inputs.userId
  .pipe(flatMap((id) => fetchUserData(id)))
  .to(outputs.userData);
```

---

## Chaining Operators

Operators can be chained using `.pipe()`:

```typescript
inputs.value
  .pipe(filter((x) => x > 0))
  .pipe(map((x) => x * 2))
  .pipe(debounce(100))
  .to(outputs.result);
```

Or combined in a single pipe:

```typescript
inputs.value
  .pipe(
    filter((x) => x > 0),
    map((x) => x * 2),
    debounce(100)
  )
  .to(outputs.result);
```

---

## Flow Methods

### .on(handler)

Subscribe to values manually instead of using `.to()`.

```typescript
inputs.trigger.on((value) => {
  if (someCondition) {
    outputs.a.emit(value);
  } else {
    outputs.b.emit(value);
  }
});
```

### .to(emitter)

Connect flow to an output emitter.

```typescript
inputs.value
  .pipe(map((x) => x * 2))
  .to(outputs.doubled);
```

---

## Examples

### Temperature Alert System

```typescript
({ inputs, outputs, config, log }) => {
  combine(inputs.temperature, inputs.humidity)
    .pipe(
      filter(([temp, hum]) => 
        temp > config.maxTemp || hum > config.maxHumidity
      ),
      map(([temp, hum]) => ({
        type: temp > config.maxTemp ? "high-temp" : "high-humidity",
        temperature: temp,
        humidity: hum,
        timestamp: Date.now(),
      }))
    )
    .to(outputs.alert);
}
```

### Debounced Search

```typescript
({ inputs, outputs, log }) => {
  inputs.query
    .pipe(
      debounce(300),
      filter((q) => q.length >= 3),
      map((q) => q.trim().toLowerCase())
    )
    .on(async (query) => {
      log.info("Searching", { query });
      const results = await searchAPI(query);
      outputs.results.emit(results);
    });
}
```

### Polling with Interval

```typescript
({ outputs, config, start, log }) => {
  start(interval(config.pollInterval))
    .on(async (tick) => {
      log.debug("Polling", { tick });
      try {
        const data = await fetchData();
        outputs.data.emit(data);
      } catch (err) {
        log.error("Poll failed", { error: err });
      }
    });
}
```

### Rate-Limited Sensor

```typescript
({ inputs, outputs }) => {
  inputs.rawSensor
    .pipe(
      throttle(100),      // Max 10 readings/sec
      filter((v) => v > 0), // Valid readings only
      scan((avg, v) => avg * 0.9 + v * 0.1, 0), // Moving average
      distinct()          // Only emit on change
    )
    .to(outputs.processed);
}
```
