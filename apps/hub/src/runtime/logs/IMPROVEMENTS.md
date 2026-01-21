# Logging System Improvements

## Error Stack Traces

### Before
```typescript
this.logs.error('plugin.load.failed', { name: entry.name, error: String(error) });
```
**Problem**: Stack traces were lost by converting errors to strings

### After
```typescript
this.logs.error(
  'Failed to load plugin',
  { pluginName: entry.name, version: entry.version },
  err
);
```
**Improvement**:
- **Simple API**: Just pass the error directly as third parameter
- **Automatic handling**: Logger handles Error objects, strings, or any value
- **Full stack traces**: Preserves error.name, error.message, error.stack, error.cause
- **No boilerplate**: No instanceof checks or type conversions needed

### Multi-line Stack Display
Error stacks now display with proper formatting:
```
2026-01-21 12:34:58 ✘ error hub                Failed to load plugin
                    ├─ pluginName: "@brika/plugin-foo"
                    ├─ version: "^1.0.0"
                    └─ errorStack: Error: Cannot resolve package
                                    at resolvePluginEntry (config-loader.ts:297)
                                    at load (plugin-loader.ts:38)
                                    at bootstrap (bootstrap.ts:68)
```

## Descriptive Log Messages

### Before
Log messages were terse codes that required context to understand:
- `config.loaded`
- `plugin.init`
- `hub.started`

### After
Clear, complete sentences that explain what's happening:
- `Configuration loaded successfully`
- `Initializing bootstrap plugin`
- `Brika Hub started successfully`

### Examples

#### Configuration Loading
**Before:**
```
config.use-defaults
config.loaded
config.load-failed
```

**After:**
```
Configuration file not found, using default configuration
Configuration loaded successfully
Failed to load configuration file, falling back to defaults
```

#### Plugin Loading
**Before:**
```
plugins.sync.start
plugins.sync.done
plugin.load.failed
```

**After:**
```
Synchronizing plugin registry and state
Plugin synchronization completed successfully
Failed to load plugin
```

#### Bootstrap
**Before:**
```
hub.hot-reload
plugin.init
plugin.load
plugin.start
hub.started
```

**After:**
```
Hot reload detected, skipping initialization
Initializing bootstrap plugin
Loading bootstrap plugin
Starting bootstrap plugin
Brika Hub started successfully
```

## Contextual Metadata

### Before
Minimal context:
```typescript
this.logs.info('config.loaded', { path: this.configPath });
```

### After
Rich context for better debugging:
```typescript
this.logs.info('Configuration loaded successfully', {
  configPath: this.configPath,
  pluginCount: this.#config.plugins.length,
  ruleCount: this.#config.rules.length,
  scheduleCount: this.#config.schedules.length,
});
```

### Metadata Display
```
2026-01-21 12:34:56 ℹ info  hub                Configuration loaded successfully
                    ├─ configPath: "/path/to/brika.yml"
                    ├─ pluginCount: 5
                    ├─ ruleCount: 3
                    └─ scheduleCount: 2
```

## Improved Files

1. **config-loader.ts**
   - Descriptive messages for load/save operations
   - Full error objects with stack traces
   - Rich metadata (counts, paths)

2. **brika-initializer.ts**
   - Clear initialization messages
   - Proper context passing

3. **templates-tar.ts**
   - Debug-level file operations
   - Descriptive skip/create messages

4. **plugin-loader.ts**
   - Better sync messages
   - Full error details on load failures
   - Plugin metadata (name, version)

5. **bootstrap.ts**
   - Lifecycle phase descriptions
   - Plugin names in context
   - Success summaries with stats

## Benefits

1. **Developer Experience**
   - Immediately understand what's happening
   - No need to grep source code for log codes
   - Clear error messages with full context

2. **Debugging**
   - Full stack traces preserved
   - Rich metadata for investigation
   - Clear indication of success/failure

3. **Production Monitoring**
   - Meaningful log messages for alerts
   - Easy to grep and filter
   - Professional output format

4. **Consistency**
   - All logs follow same pattern
   - Structured metadata
   - Proper log levels (info/warn/error/debug)
