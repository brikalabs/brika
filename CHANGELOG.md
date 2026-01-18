# Changelog

All notable changes to BRIKA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Major Breaking Changes

### 🚀 Major Changes

This release removes all legacy code and deprecated APIs. The project now follows a clean, forward-only architecture with no backward compatibility layers.

**Note:** Version will be bumped when ready for release.

### 💥 Breaking Changes

#### SDK Package (`@brika/sdk`)
- **REMOVED**: `isPassthrough()` function - Use `isPassthroughRef()` instead for type-safe checks
- **REMOVED**: Legacy `api.ts` re-export wrapper - Import directly from modular structure

#### Automation Engine
- **REMOVED**: Legacy single executor pattern
  - Removed: `startWorkflow(id, listener)` - Use workflow-specific methods via `setEnabled()`
  - Removed: `stopWorkflow()` - Use `setEnabled(id, false)`
  - Removed: `inject(blockId, port, data)` - No longer supported
  - Removed: `runningWorkflowId` getter - Use `isWorkflowRunning(id)`
  - Removed: `isRunning` getter - Use `isWorkflowRunning(id)`
  - Removed: `addListener()` - Use `addGlobalListener()` for all workflows
  - Removed: `getPortValue()`, `getAllBuffers()`, `retrigger()` - No longer supported
- **NEW**: Multi-workflow execution - Multiple workflows can now run simultaneously
- **USE**: `setEnabled(id, boolean)` to start/stop individual workflows
- **USE**: `addGlobalListener()` to monitor all workflow events

#### IPC Contract (`@brika/ipc`)
- **REMOVED**: Legacy one-shot block execution
  - Removed: `executeBlock` RPC
  - Removed: `BlockContext` type
  - Removed: `BlockResult` type
- **USE**: Reactive block lifecycle (`startBlock`, `stopBlock`, `pushInput`, `blockEmit`)

#### Plugin Loading
- **REMOVED**: `BRIKA_PLUGINS` environment variable support
- **USE**: Configure all plugins in `brika.yml` instead

#### UI Components
- **REMOVED**: `BlockType` type alias - Use `BlockDefinition` consistently
- **REMOVED**: Legacy block ID mapping (blocks without `pluginId:` prefix)
- **USE**: Always reference blocks with full `pluginId:blockId` format

### ✨ Enhancements

#### Logging System
- **NEW**: Convenience logging methods: `log.info()`, `log.debug()`, `log.warn()`, `log.error()`
- **NEW**: Automatic error stack trace capture when passing `{ error: err }` to `log.error()`
- **NEW**: Enhanced LogList UI with:
  - Icons for log levels (AlertCircle, AlertTriangle, Info, Bug)
  - Expandable error stacks - click to view full stack traces
  - Better visual hierarchy with borders and spacing
  - Separated error details from general metadata
- **NEW**: Hub logger also supports automatic error stack capture

#### SDK Structure
- **NEW**: Modular API structure for better tree-shaking:
  - `api/logging.ts` - Logging functions
  - `api/events.ts` - Event bus functions
  - `api/lifecycle.ts` - Lifecycle hooks
  - `api/preferences.ts` - Configuration functions
- **IMPROVED**: Cleaner imports and better bundle sizes

### 📚 Documentation

- **NEW**: `DEVELOPMENT.md` - SDK development guidelines with versioning strategy
- **UPDATED**: `CONTRIBUTING.md` - Added versioning section explaining no-backward-compatibility policy
- **UPDATED**: `README.md` - Updated logging examples with new convenience methods

### 🔧 Migration Guide

#### Updating Logging
```typescript
// Before
log('info', 'Message', { data: value });

// After (both work, new style recommended)
log('info', 'Message', { data: value });  // Still supported
log.info('Message', { data: value });     // New, cleaner

// Error logging with automatic stack capture
try {
  await operation();
} catch (err) {
  log.error('Operation failed', { error: err });  // Auto-captures stack
}
```

#### Updating Workflow Management
```typescript
// Before
await engine.startWorkflow(workflowId);
engine.stopWorkflow();

// After
await engine.setEnabled(workflowId, true);   // Start
await engine.setEnabled(workflowId, false);  // Stop
```

#### Updating Plugin Configuration
```bash
# Before (.env file)
BRIKA_PLUGINS=@my/plugin,@another/plugin

# After (brika.yml)
plugins:
  - name: @my/plugin
  - name: @another/plugin
```

#### Updating Block References
```typescript
// Before
const blockType = "myBlock";  // Legacy short form

// After
const blockType = "pluginId:myBlock";  // Always use full form
```

### 🎯 Developer Experience

- **Cleaner codebase** - No deprecated functions or compatibility layers
- **Faster iteration** - No need to worry about breaking changes, just bump versions
- **Better tree-shaking** - Modular imports reduce bundle sizes
- **Clear structure** - Well-organized code with focused modules

---

## Philosophy

BRIKA is in active development. We prioritize **clean code over backward compatibility**:

- ✅ Use semantic versioning - breaking changes bump major version
- ✅ Delete old code - don't deprecate, just remove and version bump
- ✅ Keep it simple - no legacy cruft
- ❌ No compatibility layers
- ❌ No feature flags

**For developers**: When we make breaking changes, we bump the version. Update your code and enjoy a cleaner, simpler API.
