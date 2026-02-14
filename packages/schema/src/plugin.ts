import * as z from 'zod';

/**
 * BRIKA Plugin Package Schema (Zod)
 *
 * Extends standard package.json with BRIKA-specific fields.
 * JSON Schema is generated from this file.
 */

// ============================================================================
// Base Package.json Schema
// ============================================================================

const Bugs = z.union([
  z.string(),
  z.object({
    url: z.optional(z.string()),
    email: z.optional(z.string()),
  }),
]);

const Funding = z.union([
  z.string(),
  z.object({
    url: z.string(),
    type: z.optional(z.string()),
  }),
  z.array(
    z.union([
      z.string(),
      z.object({
        url: z.string(),
        type: z.optional(z.string()),
      }),
    ])
  ),
]);

const Person = z.union([
  z.string(),
  z.object({
    name: z.string(),
    email: z.optional(z.string()),
    url: z.optional(z.string()),
  }),
]);

const Repository = z.union([
  z.string(),
  z.object({
    type: z.string(),
    url: z.string(),
    directory: z.optional(z.string()),
  }),
]);

const BasePackageJson = z.looseObject({
  $schema: z.optional(z.url().describe('JSON Schema reference for IDE validation')),
  name: z.string(),
  version: z.string(),
  description: z.optional(z.string()),
  keywords: z.optional(z.array(z.string())),
  homepage: z.optional(z.string()),
  bugs: z.optional(Bugs),
  license: z.optional(z.string()),
  author: z.optional(Person),
  contributors: z.optional(z.array(Person)),
  maintainers: z.optional(z.array(Person)),
  funding: z.optional(Funding),
  files: z.optional(z.array(z.string())),
  exports: z.optional(
    z.union([z.null(), z.string(), z.array(z.string()), z.record(z.string(), z.unknown())])
  ),
  type: z.optional(z.literal(['module', 'commonjs'])),
  main: z.optional(z.string()),
  browser: z.optional(
    z.union([z.string(), z.record(z.string(), z.union([z.string(), z.boolean()]))])
  ),
  bin: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
  man: z.optional(z.union([z.string(), z.array(z.string())])),
  directories: z.optional(z.record(z.string(), z.string())),
  repository: z.optional(Repository),
  scripts: z.optional(z.record(z.string(), z.string())),
  config: z.optional(z.record(z.string(), z.unknown())),
  dependencies: z.optional(z.record(z.string(), z.string())),
  devDependencies: z.optional(z.record(z.string(), z.string())),
  peerDependencies: z.optional(z.record(z.string(), z.string())),
  peerDependenciesMeta: z.optional(z.record(z.string(), z.object({ optional: z.boolean() }))),
  bundleDependencies: z.optional(z.union([z.boolean(), z.array(z.string())])),
  bundledDependencies: z.optional(z.union([z.boolean(), z.array(z.string())])),
  optionalDependencies: z.optional(z.record(z.string(), z.string())),
  overrides: z.optional(z.record(z.string(), z.unknown())),
  engines: z.optional(z.record(z.string(), z.string())),
  os: z.optional(z.array(z.string())),
  cpu: z.optional(z.array(z.string())),
  private: z.optional(z.boolean()),
  publishConfig: z.optional(z.record(z.string(), z.unknown())),
  workspaces: z.optional(z.array(z.string())),
  module: z.optional(z.string()),
  types: z.optional(z.string()),
  typings: z.optional(z.string()),
  packageManager: z.optional(z.string()),
  sideEffects: z.optional(z.union([z.boolean(), z.array(z.string())])),
  imports: z.optional(z.record(z.string(), z.unknown())),
});

// ============================================================================
// BRIKA-specific Schema Extensions
// ============================================================================

const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
// Simplified: allows ^1.0.0, ~1.0.0, >=1.0.0, 1.0.0, etc.
// Split into a per-token pattern to keep regex cognitive complexity low.
const semverRangeToken = /^[~^><=]*\d+\.\d+\.\d+(-[\w.-]+)?$/;
function isValidSemverRange(s: string): boolean {
  return s.split(/\s+/).every((t) => semverRangeToken.test(t));
}

const ToolSchema = z.object({
  id: z.string().describe('Tool identifier (local to plugin)'),
  description: z.optional(z.string().describe('Human-readable description')),
  icon: z.optional(z.string().describe('Lucide icon name')),
  color: z.optional(
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe('Hex color')
  ),
});

const BlockSchema = z.object({
  id: z.string().describe('Block identifier (local to plugin)'),
  name: z.optional(z.string().describe('Display name')),
  description: z.optional(z.string().describe('Human-readable description')),
  category: z.literal(['trigger', 'flow', 'action', 'transform']).describe('Block category'),
  icon: z.optional(z.string().describe('Lucide icon name')),
  color: z.optional(
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe('Hex color')
  ),
});

const SparkSchema = z.object({
  id: z.string().describe('Spark identifier (local to plugin)'),
  name: z.optional(z.string().describe('Display name')),
  description: z.optional(z.string().describe('Human-readable description')),
});

// ============================================================================
// Preference Schema (Raycast-style plugin configuration)
// ============================================================================

/** Base fields for all preference types. Name doubles as i18n key: preferences.{name}.title */
const BasePreference = z.object({
  name: z.string().describe('Preference key (also used as i18n key base)'),
  required: z.optional(z.boolean().default(false).describe('Whether this preference must be set')),
});

/** Text input preference */
const TextPreference = BasePreference.extend({
  type: z.literal('text'),
  default: z.optional(z.string().describe('Default value')),
});

/** Password preference (masked input) */
const PasswordPreference = BasePreference.extend({
  type: z.literal('password'),
  default: z.optional(z.string().describe('Default value')),
});

/** Number preference with optional constraints */
const NumberPreference = BasePreference.extend({
  type: z.literal('number'),
  default: z.optional(z.number().describe('Default value')),
  min: z.optional(z.number().describe('Minimum allowed value')),
  max: z.optional(z.number().describe('Maximum allowed value')),
  step: z.optional(z.number().describe('Step increment')),
});

/** Checkbox preference (boolean) */
const CheckboxPreference = BasePreference.extend({
  type: z.literal('checkbox'),
  default: z.optional(z.boolean().default(false).describe('Default value')),
});

/** Dropdown option - value is the key, label comes from i18n */
const DropdownOption = z.object({
  value: z.string().describe('Option value (also i18n key: preferences.{name}.options.{value})'),
});

/** Dropdown preference - requires options array */
const DropdownPreference = BasePreference.extend({
  type: z.literal('dropdown'),
  default: z.optional(z.string().describe('Default selected value')),
  options: z.array(DropdownOption).describe('Available options'),
});

/** Dynamic dropdown — options fetched via plugin route GET /preferences/{name} at runtime */
const DynamicDropdownPreference = BasePreference.extend({
  type: z.literal('dynamic-dropdown'),
  default: z.optional(z.string().describe('Default selected value')),
});

/** Link preference — renders as a button that opens a URL */
const LinkPreference = BasePreference.extend({
  type: z.literal('link'),
  url: z
    .string()
    .describe('URL to open. Relative paths (starting with /) resolve to plugin routes.'),
});

/** Discriminated union of all preference types */
const PreferenceSchema = z.discriminatedUnion('type', [
  TextPreference,
  PasswordPreference,
  NumberPreference,
  CheckboxPreference,
  DropdownPreference,
  DynamicDropdownPreference,
  LinkPreference,
]);

export type PreferenceSchema = z.infer<typeof PreferenceSchema>;

// ============================================================================
// Brick Schema (depends on PreferenceSchema for per-instance config)
// ============================================================================

const BrickFamilySchema = z.literal(['sm', 'md', 'lg']);

const BrickSchema = z.object({
  id: z.string().describe('Brick identifier (local to plugin)'),
  name: z.optional(z.string().describe('Display name')),
  description: z.optional(z.string().describe('Human-readable description')),
  category: z.optional(z.string().describe('Brick category for grouping')),
  icon: z.optional(z.string().describe('Lucide icon name')),
  color: z.optional(
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe('Hex color')
  ),
  families: z.optional(z.array(BrickFamilySchema).describe('Supported size families (sm, md, lg)')),
  config: z.optional(z.array(PreferenceSchema).describe('Per-instance configuration schema')),
});

// ============================================================================
// Final Plugin Package Schema
// ============================================================================

export const PluginPackageSchema = BasePackageJson.extend({
  // Override: plugin name can be scoped or unscoped
  name: z
    .string()
    .regex(/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/)
    .describe(
      'Plugin package name (used as plugin ID). Can be scoped (e.g., @myorg/plugin-name) or unscoped (e.g., brika-plugin-example)'
    ),

  // Override: strict semver for plugins
  version: z.string().regex(semverPattern).describe('Plugin version (semver)'),

  // Override: require engines with brika field
  engines: z
    .looseObject({
      brika: z
        .string()
        .refine(isValidSemverRange, 'Invalid semver range')
        .describe('Required BRIKA hub version (semver range). Should match @brika/sdk version.'),
    })
    .describe("Engine requirements. Must include 'brika' field."),

  // BRIKA-specific fields
  tools: z.optional(z.array(ToolSchema).describe('Tools provided by this plugin')),
  blocks: z.optional(z.array(BlockSchema).describe('Workflow blocks provided by this plugin')),
  sparks: z.optional(
    z.array(SparkSchema).describe('Typed event (spark) definitions provided by this plugin')
  ),
  bricks: z.optional(z.array(BrickSchema).describe('Dashboard bricks provided by this plugin')),
  icon: z.optional(z.string().describe('Path to plugin icon (PNG/SVG, relative to package root)')),
  preferences: z.optional(
    z.array(PreferenceSchema).describe('Plugin preferences/configuration schema')
  ),
});

/**
 * TypeScript type for BRIKA plugin package.json
 */
export type PluginPackageSchema = z.infer<typeof PluginPackageSchema>;
