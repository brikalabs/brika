# @brika/events

A fully typed event system with Zod schemas and declarative actions.

## Features

- **Zero boilerplate**: Define actions with Zod schemas only
- **Fully typed**: TypeScript types auto-generated from Zod schemas
- **Runtime validation**: All actions validated with Zod
- **Promise support**: Wait for events with `once`, `waitFor`, and `race`
- **Pattern matching**: Support wildcards (`plugin.*`) and custom matchers
- **Timeout support**: Built-in timeout for Promise-based methods

## Installation

```bash
bun add @brika/events
```

## Usage

### Define Actions

```typescript
import { z } from 'zod';
import { defineActions, type ActionsUnion } from '@brika/events';

// Define actions with Zod schemas
export const PluginActions = defineActions('plugin', {
  loaded: z.object({
    uid: z.string(),
    name: z.string(),
    version: z.string(),
    pid: z.number().optional(),
  }),
  unloaded: z.object({
    uid: z.string(),
    name: z.string(),
  }),
  error: z.object({
    uid: z.string(),
    error: z.string(),
  }),
});

// Type union auto-generated - zero boilerplate!
export type PluginAction = ActionsUnion<typeof PluginActions>;
```

### Create EventSystem

```typescript
import { EventSystem } from '@brika/events';

const events = new EventSystem();
```

### Dispatch Actions

```typescript
// Dispatch with automatic validation
events.dispatch(PluginActions.loaded.create({
  uid: 'abc123',
  name: '@brika/plugin-timer',
  version: '1.0.0',
  pid: 12345,
}, 'hub'));
```

### Subscribe to Actions

```typescript
// Subscribe with pattern matching
events.subscribe('plugin.*', (action: PluginAction) => {
  if (action.type === 'plugin.loaded') {
    // TypeScript knows the payload type
    console.log(action.payload.uid);
  }
});

// Subscribe with custom matcher
events.subscribe((action) => action.type.startsWith('plugin.'), handler);
```

### Wait for Actions (Promises)

```typescript
// Wait for a single action
const action = await events.once('plugin.loaded', { timeout: 5000 });

// Wait with predicate
const action = await events.waitFor(
  'plugin.*',
  (action) => action.payload.uid === 'specific-uid',
  { timeout: 10000 }
);

// Race - wait for first matching action
const action = await events.race(
  ['plugin.loaded', 'plugin.error'],
  { timeout: 5000 }
);
```

## API

### `defineActions(namespace, actions)`

Defines a namespace of actions with Zod schemas.

**Parameters:**
- `namespace`: String namespace (e.g., `'plugin'`)
- `actions`: Record of action names to Zod schemas

**Returns:** Object with action creators and schemas

### `ActionsUnion<T>`

Type helper to extract union of all actions from a namespace.

### `EventSystem`

Main event system class.

**Methods:**
- `dispatch(action)`: Dispatch an action to all subscribers
- `subscribe(pattern, handler)`: Subscribe to actions matching pattern
- `once(pattern, options?)`: Wait for a single action (Promise)
- `waitFor(pattern, predicate, options?)`: Wait for action matching predicate (Promise)
- `race(patterns, options?)`: Wait for first matching action (Promise)
- `clear()`: Clear all subscriptions and pending promises

## Pattern Matching

- `'plugin.loaded'` - Exact match
- `'plugin.*'` - All plugin actions
- `'*.loaded'` - All actions ending with `.loaded`
- `RegExp` - Custom regex pattern
- `(action) => boolean` - Custom function matcher

## Examples

See `src/__tests__/example.test.ts` for complete examples.

