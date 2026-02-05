# @brika/archunitunit

Architecture testing for TypeScript/JavaScript projects. Enforce coding conventions, file structure, and architectural boundaries with a fluent DSL.

## Installation

```bash
bun add -D @brika/archunitunit
```

## Quick Start

Create `arch.config.ts` in your project root:

```ts
import { defineConfig, dirs, files } from '@brika/archunit';
import { reactFeaturePreset } from '@brika/archunit/presets';

export default defineConfig([
  // Use presets for common patterns
  reactFeaturePreset({ pageMaxLines: 100 }),

  // Custom rules with fluent API
  files('src/**/*.tsx')
    .should()
    .bePascalCase()
    .because('Components must use PascalCase'),

  files('src/hooks/*.ts')
    .should()
    .haveExportsMatching(/^use[A-Z]/, 'start with "use"')
    .because('Hooks must follow React naming convention'),

  dirs('src/features/*/')
    .should()
    .containFiles('index.ts', 'hooks.ts')
    .because('Features need consistent structure'),
]);
```

Run:

```bash
bun run arch
```

## File Rules

```ts
files('src/**/*.ts')
  .should()
  // Naming
  .bePascalCase()
  .beCamelCase()
  .beKebabCase()
  // Size
  .haveMaxLines(200)
  // Content
  .contain(/pattern/, 'description')
  .notContain(/console\.log/)
  // Imports
  .notImportFrom(/lodash/)
  .haveExportsMatching(/^use[A-Z]/, 'use prefix')
  // Classes
  .haveClassDecorator('@Injectable')
  .haveMethodDecorator('@Get')
  .extendClass('BaseService')
  .implementInterface('Repository')
  // Chaining
  .and()
  .haveMaxLines(100)
  // Reason
  .because('Explain why');
```

## Directory Rules

```ts
dirs('src/features/*/')
  .should()
  .containFiles('index.ts', 'hooks.ts', 'types.ts')
  .because('Features need consistent structure');
```

## Disabling Rules

Temporarily disable a rule with `.skip()`:

```ts
export default defineConfig([
  // This rule will be skipped
  files('src/**/*.ts')
    .should()
    .haveMaxLines(100)
    .skip(),

  // This rule runs normally
  files('src/**/*.tsx')
    .should()
    .bePascalCase(),
]);
```

## Presets

### React Feature Preset

```ts
import { reactFeaturePreset } from '@brika/archunit/presets';

reactFeaturePreset({
  featuresDir: 'src/features',      // default
  pageMaxLines: 100,                 // default
  componentMaxLines: 150,            // default
  requiredFiles: ['index.ts', 'hooks.ts'],
  allowedCrossFeatures: ['shared'],  // allow imports from these features
});
```

### Service Preset

```ts
import { servicePreset } from '@brika/archunit/presets';

servicePreset({
  servicesDir: 'src/services',
  routesDir: 'src/routes',
  serviceMaxLines: 300,
  routeMaxLines: 100,
});
```

### Custom Presets

```ts
import { definePreset, files, dirs } from '@brika/archunit';

export const myPreset = definePreset<{ maxLines?: number }>((options = {}) => [
  files('src/**/*.ts')
    .should()
    .haveMaxLines(options.maxLines ?? 200),

  dirs('src/modules/*/')
    .should()
    .containFiles('index.ts'),
]);
```

## Programmatic API

```ts
import { runArch, printResult } from '@brika/archunit';

const result = await runArch({
  cwd: process.cwd(),
  rules: [...],
});

printResult(result);
// { passed: false, violations: [...], elapsed: 5.2, rulesChecked: 10, filesScanned: 55 }
```

## CLI

```bash
# Run with config file (arch.config.ts)
archunit

# Add to package.json
{
  "scripts": {
    "check:arch": "archunit"
  }
}
```

## Output

```
✗ Architecture violations:

  *Page.tsx should ≤ 100 lines (Page components must be small) (3)
    • src/features/users/UsersPage.tsx: 167 lines (max 100) → Split into smaller files
    • src/features/settings/SettingsPage.tsx: 245 lines (max 100) → Split into smaller files

  src/features/*/ should have index.ts, hooks.ts (Features need consistent structure) (1)
    • src/features/auth: Missing "hooks.ts"

4 violation(s) · 55 files · 6.2ms
```

## License

MIT
