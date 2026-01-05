# TypeScript Configuration

## Structure

```
brika/
├── tsconfig.json              # Root config (base settings)
└── packages/
    ├── schema/tsconfig.json   # Extends root
    ├── shared/tsconfig.json   # Extends root
    ├── events/tsconfig.json   # Extends root
    ├── sdk/tsconfig.json      # Extends root
    ├── ipc/tsconfig.json      # Extends root
    ├── router/tsconfig.json   # Extends root
    └── banner/tsconfig.json   # Extends root
```

## Root Configuration

**Location:** `/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    // ... more options
  }
}
```

### Key Settings

- **`moduleResolution: "bundler"`** - Bun's module resolution
- **`types: ["bun-types"]`** - Bun API types (Bun.file, etc.)
- **`strict: true`** - All strict type checking enabled
- **`skipLibCheck: true`** - Skip checking node_modules types

## Package Configurations

Each package extends the root config:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Package-Specific

**`packages/schema/tsconfig.json`** includes scripts:

```json
{
  "include": ["src/**/*", "scripts/**/*"]
}
```

This allows TypeScript checking for both source and build scripts.

## Benefits

✅ **Consistent configuration** across all packages  
✅ **IDE support** - Full IntelliSense and type checking  
✅ **Bun types** - Native Bun APIs like `Bun.file()`, `Bun.write()`  
✅ **Strict mode** - Catch errors early  
✅ **Monorepo friendly** - Extends root config  

## Usage

### Type Checking

```bash
# Check all packages
bun run tsc

# Check specific package
bun --filter @brika/schema run tsc
```

### IDE Integration

VS Code and other IDEs automatically use tsconfig.json for:
- Type checking
- IntelliSense/autocomplete
- Error highlighting
- Go to definition
- Refactoring

### Common Issues Fixed

#### Before (No tsconfig)

```typescript
import { PluginPackageSchema } from "./plugin.ts";
// ❌ Cannot find module

const file = Bun.file("path");
// ❌ Cannot find name 'Bun'

import { join } from "node:path";
// ❌ Cannot find module 'node:path'
```

#### After (With tsconfig)

```typescript
import { PluginPackageSchema } from "./plugin";
// ✅ Works (bundler resolution)

const file = Bun.file("path");
// ✅ Works (bun-types)

import { join } from "node:path";
// ✅ Works (bundler resolution)
```

## Adding New Packages

When creating a new package, add a tsconfig.json:

```bash
cd packages/my-new-package
cat > tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

## Troubleshooting

### "Cannot find name 'Bun'"

Ensure `bun-types` is installed:

```bash
bun add -d bun-types
```

And it's in types array in root tsconfig.json.

### "Cannot find module"

Check:
1. Import has no `.ts` extension
2. Module exists in package
3. `moduleResolution: "bundler"` in root config

### "Not under 'rootDir'"

Remove `rootDir` from package tsconfig if including multiple directories (like `src/` and `scripts/`).

## Scripts in package.json

Add tsc script to packages that need it:

```json
{
  "scripts": {
    "tsc": "bunx --biome tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

## Related

- [Bun TypeScript](https://bun.sh/docs/runtime/typescript)
- [TypeScript Config Reference](https://www.typescriptlang.org/tsconfig)
- [tsconfig.json](../tsconfig.json) - Root configuration

---

**Status:** ✅ Configured for all packages  
**No errors:** All TypeScript errors resolved
