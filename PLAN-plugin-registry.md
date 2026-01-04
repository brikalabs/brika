sav# Plugin Registry & Storage Improvement Plan

## Overview

Improve how plugins are downloaded, stored, and loaded by:

1. Using a dedicated `.elia` directory for plugin storage
2. Leveraging `bun install` for registry downloads with progress UI
3. Simplifying the `plugin.ref` system
4. Maintaining development workflow via workspace loading

---

## Current State Analysis

### Current Plugin Loading (`apps/hub/src/runtime/plugins/plugin-manager.ts`)

- **Refs supported**: `file:`, `workspace:`, `npm:`, `git:`
- **Storage**: `{homeDir}/plugins-node/` for npm packages
- **Resolution**: Uses `Bun.resolveSync()` for module resolution

### Current StoreService (`apps/hub/src/runtime/store/store-service.ts`)

- Uses `bun add` in `plugins-node/` directory
- No progress reporting
- Basic stdout/stderr piping to logs

### Pain Points

1. `plugins-node/` name is confusing
2. No download progress visible in UI
3. Multiple ref formats add complexity
4. No clear separation between dev and production plugins

---

## Proposed Architecture

### 1. New Directory Structure

```
~/.elia/                          # User's Elia home directory
├── plugins/                      # Plugin installation directory
│   ├── node_modules/            # All packages (registry + workspace)
│   │   ├── @elia/
│   │   │   └── plugin-timer/    # Registry package
│   │   └── my-dev-plugin/       # Symlinked workspace package
│   ├── package.json             # Single source of truth
│   └── bun.lockb               # Lock file
├── state.json                   # Plugin state (existing)
├── logs.db                      # Log database (existing)
└── config.yml                   # Future: user config
```

### 2. Unified Ref System (Bun Native)

**Key Insight**: Bun's `workspace:` protocol in `package.json` handles EVERYTHING:

- Registry packages: `"@elia/plugin-timer": "^1.0.0"`
- Local development: `"my-plugin": "workspace:/path/to/my-plugin"`

**Single package.json manages all plugins:**

```json
{
  "name": "elia-plugins",
  "private": true,
  "dependencies": {
    "@elia/plugin-timer": "^1.0.0",
    "@elia/plugin-openai": "^2.1.0",
    "my-dev-plugin": "workspace:/Users/me/projects/my-plugin"
  }
}
```

**Benefits:**

- No custom resolution logic needed
- Bun handles symlinks for workspace packages
- Single `bun install` installs everything
- `Bun.resolveSync(packageName, pluginsDir)` just works for all types
- Dependency deduplication across all plugins

### 3. Download Progress Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI (PluginsPage)                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Installing @elia/plugin-timer...                    │    │
│  │  ████████████░░░░░░░░  45% - Downloading...          │    │
│  │                                                       │    │
│  │  Recent Activity:                                     │    │
│  │  • Resolving dependencies...                          │    │
│  │  • Downloading @elia/plugin-timer@1.2.3              │    │
│  │  • Downloading @elia/sdk@0.3.0 (dependency)          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
          │
          │ WebSocket / SSE
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Hub Runtime                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PluginRegistry (new service)                        │    │
│  │  - install(packageName, version?)                    │    │
│  │  - uninstall(packageName)                            │    │
│  │  - list() → installed packages                       │    │
│  │  - events: progress, log, complete, error            │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                  │
│           │ Bun subprocess with stdout/stderr streaming     │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  bun install @elia/plugin-timer                      │    │
│  │  (in ~/.elia/plugins/ directory)                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: New Plugin Registry Service

**Step 1.1: Create PluginRegistry service**

File: `apps/hub/src/runtime/registry/plugin-registry.ts`

```typescript
interface OperationProgress {
  phase: 'resolving' | 'downloading' | 'linking' | 'complete' | 'error';
  operation: 'install' | 'update' | 'uninstall';
  package: string;
  currentVersion?: string;
  targetVersion?: string;
  progress?: number; // 0-100
  message: string;
  error?: string;
}

interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

interface PluginRegistry {
  // Install a package from registry
  install (packageName: string, version?: string): AsyncGenerator<OperationProgress>;

  // Update a single package or all packages
  update (packageName?: string): AsyncGenerator<OperationProgress>;

  // Check for available updates
  checkUpdates (): Promise<UpdateInfo[]>;

  // Uninstall a package
  uninstall (packageName: string): Promise<void>;

  // List installed packages
  list (): Promise<InstalledPackage[]>;

  // Check if package is installed
  has (packageName: string): Promise<boolean>;

  // Get package info
  get (packageName: string): Promise<InstalledPackage | null>;

  // Resolve package entry point
  resolve (packageName: string): string | null;
}
```

Key features:

- Uses `Bun.spawn()` with streaming stdout/stderr
- Parses bun's output for progress indicators
- Emits events for UI consumption
- Manages `~/.elia/plugins/package.json`

**Step 1.2: Initialize plugins directory**

```typescript
async function initPluginsDir(): Promise<string> {
  const dir = join(homeDir(), 'plugins');

  if (!existsSync(join(dir, 'package.json'))) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'elia-plugins',
      private: true,
      dependencies: {}
    }, null, 2));
  }

  return dir;
}
```

### Phase 2: Progress Streaming to UI

**Step 2.1: Add SSE endpoint for install progress**

File: `apps/hub/src/runtime/http/routes/registry.ts`

```typescript
// POST /api/registry/install
// Body: { package: string, version?: string }
// Response: SSE stream of InstallProgress events

// GET /api/registry/packages
// Response: List of installed packages

// DELETE /api/registry/packages/:name
// Uninstall a package
```

**Step 2.2: Parse bun output for progress**

Bun outputs progress like:

```
bun add v1.x.x

installed @elia/plugin-timer@1.2.3

3 packages installed [0.45s]
```

Parser extracts:

- Package resolution status
- Download progress (from byte counts if available)
- Installation complete signal
- Error messages

**Step 2.3: UI Install Dialog with Progress**

File: `apps/ui/src/features/plugins/components/InstallPluginDialog.tsx`

```tsx
function InstallPluginDialog() {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const install = async (packageName: string) => {
    const response = await fetch('/api/registry/install', {
      method: 'POST',
      body: JSON.stringify({ package: packageName })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const event = JSON.parse(decoder.decode(value));
      setProgress(event);
      setLogs(prev => [...prev, event.message]);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <Input placeholder="@elia/plugin-timer" />

        {progress && (
          <div>
            <Progress value={progress.progress} />
            <p>{progress.message}</p>
          </div>
        )}

        <ScrollArea>
          {logs.map((log, i) => <p key={i}>{log}</p>)}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

### Phase 3: Simplify Plugin Resolution

**Step 3.1: Update PluginManager resolution**

File: `apps/hub/src/runtime/plugins/plugin-manager.ts`

```typescript
// MASSIVELY SIMPLIFIED - Bun does everything!
resolveEntry(packageName
:
string
):
string
{
  const pluginsDir = join(homeDir(), 'plugins');
  return Bun.resolveSync(packageName, pluginsDir);
}
```

That's it! No more:

- `workspace:` prefix handling
- `file:` prefix handling
- `npm:` prefix handling
- `git:` prefix handling

Bun resolves from `node_modules/` whether it's a registry package or a workspace symlink.

**Step 3.2: Install commands**

```bash
# Registry plugin
bun add @elia/plugin-timer

# Local development plugin (creates symlink)
bun add my-plugin@workspace:/path/to/my-plugin

# With version
bun add @elia/plugin-timer@^1.0.0
```

**Step 3.3: Plugin identification**

Plugins are now identified by their **package name** (from package.json `name` field):

- `@elia/plugin-timer`
- `my-dev-plugin`
- `elia-plugin-openai`

No more refs! Just package names.

### Phase 4: Update/Upgrade Functionality

**Step 4.1: Check for updates**

```typescript
async
checkUpdates()
:
Promise < UpdateInfo[] > {
  const pluginsDir = join(homeDir(), 'plugins');

  // Run bun outdated to check for updates
  const proc = Bun.spawn(['bun', 'outdated', '--json'], {
    cwd: pluginsDir,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const output = await new Response(proc.stdout).text();
  const outdated = JSON.parse(output);

  return outdated.map(pkg => ({
    name: pkg.name,
    currentVersion: pkg.current,
    latestVersion: pkg.latest,
    updateAvailable: pkg.current !== pkg.latest
  }));
}
```

**Step 4.2: Update single or all plugins**

```typescript
async * update(packageName ? : string)
:
AsyncGenerator < OperationProgress > {
  const pluginsDir = join(homeDir(), 'plugins');

  // bun update [package] or bun update (all)
  const args = packageName
    ? ['bun', 'update', packageName]
    : ['bun', 'update'];

  const proc = Bun.spawn(args, {
    cwd: pluginsDir,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  // Stream progress...
  for await (const chunk of proc.stdout
)
{
  const line = decoder.decode(chunk);
  yield parseProgress(line, 'update');
}

yield {
  phase: 'complete',
  operation: 'update',
  package: packageName ?? 'all',
  message: 'Update complete'
};
}
```

**Step 4.3: UI for updates**

File: `apps/ui/src/features/plugins/components/PluginUpdateBadge.tsx`

```tsx
function PluginUpdateBadge({ plugin }: { plugin: Plugin }) {
  const { data: updates } = usePluginUpdates();
  const update = updates?.find(u => u.name === plugin.name);

  if (!update?.updateAvailable) return null;

  return (
    <Badge variant="outline" className="text-blue-500">
      {update.currentVersion} → {update.latestVersion}
    </Badge>
  );
}
```

File: `apps/ui/src/features/plugins/components/UpdateAllButton.tsx`

```tsx
function UpdateAllButton() {
  const { data: updates } = usePluginUpdates();
  const { mutate: updateAll, isPending } = useUpdatePlugins();

  const available = updates?.filter(u => u.updateAvailable) ?? [];

  if (available.length === 0) return null;

  return (
    <Button onClick={() => updateAll()} disabled={isPending}>
      {isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
      Update {available.length} plugin{available.length > 1 ? 's' : ''}
    </Button>
  );
}
```

### Phase 5: Auto-Install on Startup

**Step 4.1: Sync plugins from config**

File: `apps/hub/src/runtime/app.ts`

```typescript
async function syncPlugins (config: Config) {
  const registry = new PluginRegistry();
  const installed = await registry.list();
  const wanted = new Set(config.plugins.map(p => p.name));

  // Install missing plugins
  for (const plugin of config.plugins) {
    if (!installed.has(plugin.name)) {
      console.log(`Installing ${plugin.name}...`);
      for await (const progress of registry.install(plugin.name, plugin.version)) {
        console.log(`  ${progress.message}`);
      }
    }
  }

  // Optionally: warn about plugins not in config
  for (const pkg of installed) {
    if (!wanted.has(pkg.name)) {
      console.log(`Note: ${pkg.name} is installed but not in config`);
    }
  }
}
```

### Phase 5: Migration

**Step 5.1: Migrate existing plugins-node/**

```typescript
async function migratePluginsDir() {
  const oldDir = join(homeDir(), 'plugins-node');
  const newDir = join(homeDir(), 'plugins');

  if (existsSync(oldDir) && !existsSync(newDir)) {
    await rename(oldDir, newDir);
    console.log('Migrated plugins-node/ to plugins/');
  }
}
```

**Step 5.2: Update state.json**

- Change `ref` field to `name` (package name)
- Remove all prefix logic (`npm:`, `workspace:`, `file:`)
- Plugin state keyed by package name

```typescript
// Old state
{ ref: "npm:@elia/plugin-timer", dir: "...", ... }

// New state
{ name: "@elia/plugin-timer", ... }
// dir is now derived: ~/.elia/plugins/node_modules/@elia/plugin-timer
```

**Step 5.3: Update brika.yml config format**

```yaml
# Old format (legacy - still supported)
install:
  - ref: "npm:@elia/plugin-timer"
    enabled: true
  - ref: "workspace:timer"
    enabled: true

# New format (package.json-like)
install:
  # Key is package name, value is version specifier
  "@elia/plugin-timer": "^1.0.0"           # Registry package
  "@elia/plugin-hue": "latest"             # Latest from registry
  "timer": "workspace:./plugins/timer"     # Local workspace plugin
  "example-echo": "workspace:./plugins/example-echo"
```

The new format mirrors `package.json` dependencies, making it intuitive and consistent.

---

## File Changes Summary

### New Files

- `apps/hub/src/runtime/registry/plugin-registry.ts` - Core registry service with progress streaming
- `apps/hub/src/runtime/registry/bun-output-parser.ts` - Parse bun install/update output for progress
- `apps/hub/src/runtime/http/routes/registry.ts` - SSE endpoints for install/update/uninstall
- `apps/ui/src/features/plugins/components/InstallPluginDialog.tsx` - UI dialog with progress bar
- `apps/ui/src/features/plugins/components/PluginUpdateBadge.tsx` - Shows available update version
- `apps/ui/src/features/plugins/components/UpdateAllButton.tsx` - Bulk update button
- `apps/ui/src/features/plugins/hooks/usePluginInstall.ts` - Hook for install SSE
- `apps/ui/src/features/plugins/hooks/usePluginUpdates.ts` - Hook for checking updates

### Modified Files

- `apps/hub/src/runtime/plugins/plugin-manager.ts` - Remove all ref prefix logic, use package names
- `apps/hub/src/runtime/config/config-loader.ts` - New config format with name/path
- `apps/hub/src/runtime/app.ts` - Sync plugins on startup
- `apps/hub/src/runtime/state/state-store.ts` - Use package name as key, remove ref field
- `apps/ui/src/features/plugins/PluginsPage.tsx` - Integrate install dialog

### Removed Files

- `apps/hub/src/runtime/store/store-service.ts` - Replaced by PluginRegistry

---

## API Changes

### New Endpoints

```
POST /api/registry/install
  Body: { package: string, version?: string }
  Response: SSE stream of OperationProgress

POST /api/registry/update
  Body: { package?: string }  # Optional - if omitted, updates all
  Response: SSE stream of OperationProgress

GET /api/registry/updates
  Response: { updates: UpdateInfo[] }

GET /api/registry/packages
  Response: { packages: InstalledPackage[] }

DELETE /api/registry/packages/:name
  Response: { success: boolean }

GET /api/registry/packages/:name
  Response: InstalledPackage | null
```

### Modified Endpoints

```
POST /api/plugins/load
  Body: { ref: string }  # Now supports simplified refs

GET /api/plugins
  Response: # Includes source: 'registry' | 'workspace' | 'file'
```

---

## Benefits

1. **Zero custom resolution logic**: Bun handles everything via native `workspace:` protocol
2. **Single package.json**: One file tracks all plugins (registry + local dev)
3. **Progress visibility**: Users see real-time download/install progress in UI
4. **Simpler mental model**: Plugins are just npm packages with package names
5. **Dependency deduplication**: Bun dedupes shared deps across all plugins
6. **Standard tooling**: Works with existing npm/bun ecosystem
7. **Symlinks for dev**: Local plugins are symlinked, changes reflected immediately
8. **No more refs**: Package name IS the identifier, no prefixes needed

---

## Open Questions

1. **Custom registry support?** Bun supports `.npmrc` - should we document this?
2. **Version pinning?** Lock file (bun.lockb) handles this - do we need additional control?
3. **Plugin updates?** Should we add `bun update` integration or leave manual?
4. **Multiple workspaces?** If user works on multiple projects, should plugins be per-project or global?

---

## Testing Strategy

1. **Unit tests**: Registry service, progress parser
2. **Integration tests**: Full install/uninstall cycle
3. **E2E tests**: UI install dialog with mocked API
4. **Manual testing**: Real npm packages, workspace plugins

---

## Estimated Scope

- **Phase 1**: Core registry service (main work)
- **Phase 2**: Progress streaming (moderate)
- **Phase 3**: Resolution simplification (small refactor)
- **Phase 4**: Auto-install (small)
- **Phase 5**: Migration (small)

This can be implemented incrementally with each phase being independently testable.

---

## Before / After Comparison

### Before (Current System)

```typescript
// Multiple ref formats to handle
resolveEntry(ref: string) {
  if (ref.startsWith('workspace:')) { /* custom logic */ }
  if (ref.startsWith('file:')) { /* custom logic */ }
  if (ref.startsWith('npm:')) { /* custom logic */ }
  if (ref.startsWith('git:')) { /* custom logic */ }
  // Complex resolution...
}

// State stores refs
{ ref: "npm:@elia/plugin-timer", dir: "/path/to/...", ... }

// Config uses refs
plugins:
  - ref: "workspace:timer"
  - ref: "npm:@elia/plugin-timer"
```

### After (New System)

```typescript
// ONE LINE - Bun does everything
resolveEntry(packageName
:
string
)
{
  return Bun.resolveSync(packageName, pluginsDir);
}

// State uses package names
{
  name: "@elia/plugin-timer",
...
}

// Config uses package names
plugins:
  -name
:
"@elia/plugin-timer"
- name
:
"timer"
path: "./plugins/timer"
#
For
local
dev
```

### Installation Commands

```bash
# Registry plugin
bun add @elia/plugin-timer --cwd ~/.elia/plugins

# Local development plugin (symlinked)
bun add timer@workspace:./plugins/timer --cwd ~/.elia/plugins

# Both go into the SAME package.json, SAME node_modules
# Bun handles resolution automatically
```

---

## Implementation Order (Recommended)

1. **Create `~/.elia/plugins/` structure** with package.json initialization
2. **Build PluginRegistry service** with `install()`, `update()`, `uninstall()`, `list()`, `checkUpdates()`
3. **Add progress streaming** to install and update methods
4. **Build SSE API endpoints** for install/update operations
5. **Build UI InstallPluginDialog** with progress display
6. **Build UI update components** (PluginUpdateBadge, UpdateAllButton)
7. **Simplify PluginManager** to use package names only
8. **Update StateStore** to use package name as key
9. **Add migration** from old system
10. **Update config format** in ConfigLoader
11. **Test end-to-end** with registry and workspace plugins
