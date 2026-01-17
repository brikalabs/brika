# Runtime Utilities

This directory contains reusable utility functions for the Brika runtime.

## Semver Utilities

The `semver.ts` module provides robust semantic versioning utilities that can be used throughout the application.

### Basic Usage

```typescript
import { semver } from '@/runtime/utils';

// Parse a version
const version = semver.parse('1.2.3');
// { major: 1, minor: 2, patch: 3 }

// Compare versions
semver.compare('1.2.3', '1.2.4'); // -1 (less than)
semver.compare('1.2.3', '1.2.3'); // 0 (equal)
semver.compare('1.2.4', '1.2.3'); // 1 (greater than)

// Comparison helpers
semver.gt('1.2.4', '1.2.3'); // true
semver.gte('1.2.3', '1.2.3'); // true
semver.lt('1.2.3', '1.2.4'); // true
semver.lte('1.2.3', '1.2.3'); // true
semver.eq('1.2.3', '1.2.3'); // true

// Check if version satisfies range
semver.satisfies('1.2.3', '^1.0.0'); // true
semver.satisfies('2.0.0', '^1.0.0'); // false
semver.satisfies('1.2.3', '~1.2.0'); // true
semver.satisfies('1.3.0', '~1.2.0'); // false

// Find maximum version that satisfies range
const versions = ['1.0.0', '1.2.3', '1.5.0', '2.0.0'];
semver.maxSatisfying(versions, '^1.0.0'); // '1.5.0'

// Validate and coerce versions
semver.isValid('1.2.3'); // true
semver.isValid('invalid'); // false
semver.coerce('v1.2'); // '1.2.0'
```

### Supported Range Patterns

- **Exact**: `"1.2.3"` - Matches exact version
- **Caret**: `"^1.2.3"` - Compatible with 1.x.x (>=1.2.3 <2.0.0)
  - Special case: `"^0.2.3"` matches 0.2.x only (0.x is unstable)
- **Tilde**: `"~1.2.3"` - Approximately equivalent (1.2.x)
- **Greater than**: `">1.2.3"`, `">=1.2.3"`
- **Less than**: `"<1.2.3"`, `"<=1.2.3"`
- **Ranges**: `">=1.2.3 <2.0.0"` - Multiple conditions with spaces

## Compatibility Utilities

The `compatibility.ts` module provides plugin compatibility checking.

### Check Plugin Compatibility

```typescript
import { checkCompatibility } from '@/runtime/utils';

// Check if plugin is compatible with current Brika version
const result = checkCompatibility('^0.2.0');

if (result.compatible) {
  console.log('Plugin is compatible!');
} else {
  console.error(result.reason);
  // "Requires Brika ^0.2.0, current version is 0.1.5"
}
```

### Check Against Specific Version

```typescript
import { checkCompatibility } from '@/runtime/utils';

// Check compatibility with a specific version (useful for testing)
const result = checkCompatibility('^0.2.0', '0.3.0');
// { compatible: true }
```

### Check Minimum Version Requirements

```typescript
import { meetsMinimumVersion } from '@/runtime/utils';

// Check if plugin version meets minimum requirement
const isValid = meetsMinimumVersion('1.2.3', '1.0.0'); // true
const isInvalid = meetsMinimumVersion('0.9.0', '1.0.0'); // false
```

### Detailed Compatibility Check

```typescript
import { checkPluginCompatibility } from '@/runtime/utils';

const result = checkPluginCompatibility({
  name: '@brika/my-plugin',
  version: '1.0.0',
  engines: { brika: '^0.2.0' },
});

if (!result.compatible) {
  console.error(result.reason);
  console.log(result.suggestion);
  // "This plugin requires Brika ^0.2.0. Please update Brika or use an older version of this plugin."
}
```

## Common Use Cases

### 1. Plugin Installation (Registry)

```typescript
import { checkCompatibility } from '@/runtime/utils';

async function installPlugin(packageName: string) {
  // Fetch package metadata from npm
  const pkgData = await fetchPackageFromNpm(packageName);

  // Check compatibility before installing
  const compat = checkCompatibility(pkgData.engines?.brika);

  if (!compat.compatible) {
    throw new Error(`Cannot install plugin: ${compat.reason}`);
  }

  // Proceed with installation
  await downloadAndInstall(packageName);
}
```

### 2. Plugin Discovery (Store)

```typescript
import { checkCompatibility } from '@/runtime/utils';

async function enrichPluginData(npmPlugin: NpmPackage): Promise<StorePlugin> {
  // Check compatibility
  const compatResult = checkCompatibility(npmPlugin.engines?.brika);

  return {
    ...npmPlugin,
    compatible: compatResult.compatible,
    compatibilityReason: compatResult.reason,
  };
}
```

### 3. Plugin Loading (Runtime)

```typescript
import { satisfiesVersion } from '@/runtime/plugins/utils';
import { HUB_VERSION } from '@/runtime/utils';

async function loadPlugin(manifest: PluginManifest) {
  const required = manifest.engines?.brika;

  if (!required) {
    throw new Error('Plugin missing engines.brika field');
  }

  if (!satisfiesVersion(HUB_VERSION, required)) {
    throw new Error(
      `Plugin requires Brika ${required}, current version is ${HUB_VERSION}`
    );
  }

  // Proceed with loading
  await spawnPluginProcess(manifest);
}
```

### 4. Verified Plugin Validation

```typescript
import { meetsMinimumVersion } from '@/runtime/utils';

async function validateVerifiedPlugin(
  pluginName: string,
  verifiedEntry: VerifiedPlugin
) {
  const npmData = await fetchPackageFromNpm(pluginName);

  // Check if current npm version meets minimum verified version
  if (!meetsMinimumVersion(npmData.version, verifiedEntry.minVersion)) {
    console.warn(
      `Plugin ${pluginName}@${npmData.version} is below minimum verified version ${verifiedEntry.minVersion}`
    );
  }
}
```

### 5. Version Selection

```typescript
import { semver } from '@/runtime/utils';

async function selectCompatibleVersion(
  packageName: string,
  requiredRange: string
): Promise<string> {
  // Fetch all available versions from npm
  const allVersions = await fetchAvailableVersions(packageName);

  // Find the highest version that satisfies the range
  const bestVersion = semver.maxSatisfying(allVersions, requiredRange);

  if (!bestVersion) {
    throw new Error(`No compatible version found for ${requiredRange}`);
  }

  return bestVersion;
}
```

## Architecture Benefits

1. **Centralized Logic**: All semver logic in one place, easy to maintain and test
2. **Consistent Behavior**: Same semver matching everywhere in the codebase
3. **Reusable**: Can be used in plugins, registry, store, and runtime
4. **Well-Tested**: Single source of truth makes testing easier
5. **Type-Safe**: Full TypeScript support with clear interfaces

## Testing

```typescript
import { semver, checkCompatibility } from '@/runtime/utils';

// Test semver utilities
expect(semver.satisfies('1.2.3', '^1.0.0')).toBe(true);
expect(semver.satisfies('0.2.5', '^0.2.0')).toBe(true);
expect(semver.gt('1.2.4', '1.2.3')).toBe(true);

// Test compatibility checking
const result = checkCompatibility('^0.2.0', '0.2.5');
expect(result.compatible).toBe(true);

const incompatible = checkCompatibility('^1.0.0', '0.2.5');
expect(incompatible.compatible).toBe(false);
expect(incompatible.reason).toContain('Requires Brika ^1.0.0');
```

## Migration Notes

The old `parseVersion` and manual semver logic in `plugin-lifecycle.ts` has been replaced with the centralized `semver` utilities. If you find any remaining manual semver code, please migrate it to use these utilities for consistency.
