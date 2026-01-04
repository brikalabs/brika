# Bootstrap System: Auto-Discovery vs Manual Registration

## Summary

We now support **auto-discovery** of loaders using decorators! This dramatically simplifies adding new subsystems.

---

## 🎯 Auto-Discovery (Recommended)

### How to Create a New Loader

```typescript
import { inject, singleton } from '@elia/shared';
import { loader, type Loader } from '@/runtime/bootstrap';
import type { EliaConfig } from '@/runtime/config';

@loader({ priority: 20 }) // Lower = loads first
@singleton()
export class MyLoader implements Loader {
  readonly name = 'my-subsystem';

  async init(): Promise<void> {
    // Initialize resources
  }

  async load(config: EliaConfig): Promise<void> {
    // Load from config
  }

  async stop(): Promise<void> {
    // Cleanup
  }
}
```

### That's It! ✨

The loader is **automatically discovered** and registered. Just ensure it's imported somewhere (e.g., in `bootstrap/index.ts`).

---

## Priority System

Loaders run in priority order (lower numbers first):

- **5** - I18n (early initialization)
- **10** - Plugins (foundation)
- **20** - Rules & Schedules (depend on plugins)
- **30** - Automations (depend on rules/schedules)

---

## 📊 Trade-offs

### ✅ Pros of Auto-Discovery

1. **Zero boilerplate** - No manual registration needed
2. **Clear priorities** - Explicit load order via decorator
3. **Easy to add** - Just decorate your class
4. **Type-safe** - Full TypeScript support
5. **Testing-friendly** - Can clear/override registry

### ⚠️ Cons of Auto-Discovery

1. **Magic imports** - Must import loaders to trigger registration
2. **Harder to trace** - Not obvious what's loaded from reading code
3. **Bundle size** - All loaders imported even if unused (minor in Bun)

### ✅ Pros of Manual Registration

1. **Explicit** - Clear what's loaded
2. **Conditional** - Easy to load conditionally
3. **No magic** - Straightforward to understand

### ⚠️ Cons of Manual Registration

1. **Boilerplate** - Must update Bootstrap every time
2. **Error-prone** - Easy to forget to register
3. **No priority** - Must manually order

---

## 🚀 Current Implementation

We use **auto-discovery** with explicit imports in `bootstrap.ts`:

```typescript
// Auto-register all loaders
import './i18n-loader';
import './plugin-loader';
import './rule-loader';
import './schedule-loader';
import './automation-loader';

// They're automatically registered via @loader decorator
this.loaderManager.registerAll(...getLoaders());
```

This gives us the best of both worlds:
- ✅ Auto-discovery convenience
- ✅ Explicit imports for traceability

---

## 📝 Adding a New Subsystem

### Before (Manual - 3 steps):
1. Create loader class
2. Export from `index.ts`
3. **Add to Bootstrap.load() manually** ← Easy to forget!

### After (Auto - 2 steps):
1. Create loader with `@loader()` decorator
2. Import in `bootstrap.ts` ← Can't forget!

---

## 🧪 Testing

Both approaches support testing equally well:

```typescript
import { clearLoaders, loader } from '@/runtime/bootstrap';

beforeEach(() => {
  clearLoaders(); // Clear for isolated tests
});

@loader({ priority: 999 })
@singleton()
class TestLoader implements Loader { ... }
```

---

## Recommendation

**Use auto-discovery** (current implementation) because:
- Scales better as system grows
- Less error-prone
- Clear priority system
- Still explicit via imports

