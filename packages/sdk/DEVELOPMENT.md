# SDK Development Guidelines

## Philosophy

This SDK is in active development. We prioritize clean code and maintainability over backward compatibility.

### Versioning Strategy

- **Use semantic versioning** (`package.json` version field)
- **Breaking changes are OK** - just bump the major version
- **No backward compatibility layers** - keep code clean and simple
- **Document changes** in release notes

### Why No Backward Compatibility?

1. **Early Stage**: The product is still in development
2. **Version Control**: We use semantic versioning - major bumps signal breaking changes
3. **Clean Codebase**: No legacy cruft, easier to maintain
4. **Faster Iteration**: Ship features faster without compatibility overhead

### When Making Breaking Changes

1. Update the major version in `package.json`
2. Document the change in the changelog
3. Update examples and documentation
4. Clean up old code completely - don't leave deprecated functions

### Code Organization

The SDK is organized into focused modules:

```
src/
├── api/              # Plugin runtime API
│   ├── logging.ts    # log(), log.info(), log.error()
│   ├── events.ts     # emit(), on()
│   ├── lifecycle.ts  # onInit(), onStop(), onUninstall()
│   └── preferences.ts # getPreferences(), onPreferencesChange()
├── blocks/           # Reactive block system
│   ├── reactive.ts   # Core reactive primitives
│   ├── schema.ts     # Zod schema with custom types
│   └── ...
├── context.ts        # Internal IPC context
├── types.ts          # Common types
└── index.ts          # Main exports
```

### Best Practices

1. **Modular**: Keep files focused on a single responsibility
2. **Typed**: Use TypeScript strictly, no `any` types
3. **Documented**: JSDoc on all public APIs
4. **Tested**: Add tests for new features
5. **Simple**: Delete unused code, don't deprecate

### Breaking Changes Checklist

When introducing a breaking change:

- [ ] Bump major version in `package.json`
- [ ] Update `README.md` with new examples
- [ ] Remove old code completely
- [ ] Update all internal references
- [ ] Test with example plugins
- [ ] Document in release notes

## Examples

### ✅ Good - Clean Break

```typescript
// Before (v1.0.0)
export function log(level: string, message: string): void;

// After (v2.0.0) - object with methods
export const log: Logger = {
  debug(msg: string, meta?: object) { ... },
  info(msg: string, meta?: object) { ... },
  warn(msg: string, meta?: object) { ... },
  error(msg: string, meta?: object) { ... },
};
```

### ❌ Bad - Backward Compatibility

```typescript
// Don't do this!
export function log(level: string, message: string): void;

// @deprecated Use log.info() etc
export function logDeprecated(level: string, message: string): void {
  console.warn('logDeprecated is deprecated, use log.info() etc');
  log[level](message);
}
```

## Contributing

When adding new features:

1. **Keep it modular** - new API surface? Add a new file in `api/`
2. **Export cleanly** - update `index.ts` with clear comments
3. **Document well** - JSDoc examples help users
4. **Delete fearlessly** - if something isn't needed, remove it

Remember: **Clean code > Compatibility**
