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
  peerDependenciesMeta: z.optional(
    z.record(
      z.string(),
      z.object({
        optional: z.boolean(),
      })
    )
  ),
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

/**
 * A plugin-local identifier (block/brick/page/spark/tool id). These ids are
 * interpolated into served file paths (e.g. `bricks/<id>.tsx`), so they must
 * never contain path separators or dots that could escape the plugin root.
 */
const localId = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'id may only contain letters, digits, "-" and "_"');

const ToolSchema = z.object({
  id: localId.describe('Tool identifier (local to plugin)'),
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
  id: localId.describe('Block identifier (local to plugin)'),
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
  view: z.optional(
    z
      .boolean()
      .describe(
        'When true, the block ships a custom React view at `src/blocks/<id>.view.tsx` that fully owns its configuration UI in the workflow editor. Otherwise a generic schema-driven form is rendered.'
      )
  ),
  nodeView: z.optional(
    z
      .boolean()
      .describe(
        'When true, the block ships a custom React view at `src/blocks/<id>.node.tsx` rendered inside the block node on the canvas (text, image, live previews) instead of the default config summary.'
      )
  ),
});

const SparkSchema = z.object({
  id: localId.describe('Spark identifier (local to plugin)'),
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
  label: z.optional(
    z.string().describe('Human-readable label (falls back to the i18n title, then the key)')
  ),
  description: z.optional(z.string().describe('Help text shown beneath the field')),
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
  id: localId.describe('Brick identifier (local to plugin)'),
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
// Page Schema (custom tabs on plugin detail view)
// ============================================================================

const PageSchema = z.object({
  id: localId.describe('Page identifier (local to plugin)'),
  icon: z.optional(z.string().describe('Lucide icon name')),
});

// ============================================================================
// Resources (per-plugin runtime caps, opt-in)
// ============================================================================

/**
 * Unit multipliers for the byte-string parser.
 *
 * Disk and memory limits in dev tooling almost universally use base
 * 1024 (so "1 GB" of RAM ≈ 1 GiB), and that's what operators expect
 * here too — we treat `kb` and `kib` as synonyms (both = 1024) and
 * `mb`/`mib`, `gb`/`gib`, `tb`/`tib` likewise. Strict SI fans can
 * still write raw integers if they care about exact base-10 values.
 */
const BYTE_UNIT_MULTIPLIERS: Record<string, number> = {
  '': 1,
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
};

/**
 * Hard ceiling on the byte-string length we'll attempt to parse —
 * the longest legitimate value (`"1234567890.123456 tib"`-ish) is
 * well under 32 chars. Anything larger is a typo or a fuzzer.
 */
const BYTE_STRING_MAX_LENGTH = 32;

/**
 * Pattern: digits + optional `.fraction` + optional single space +
 * unit letters, anchored. Trimmed input only — leading / trailing
 * whitespace is stripped by the caller, which avoids the multiple
 * `\s*` quantifiers Sonar treats as a ReDoS hotspot. The remaining
 * character classes (`\d`, `[a-z]`) don't overlap, so the regex is
 * strictly linear.
 */
const BYTE_STRING_PATTERN = /^(\d+(?:\.\d+)?) ?([a-z]*)$/i;

/**
 * Parse a human-readable byte count like `"500mb"` / `"2 gb"` /
 * `"256 mib"` / `"1024"` into a non-negative integer.
 *
 * Returns `null` for malformed input, NaN/Infinity, negative results,
 * unknown unit suffixes, or strings exceeding `BYTE_STRING_MAX_LENGTH`.
 * The caller turns that into a zod issue.
 */
function parseByteString(raw: string): number | null {
  if (raw.length > BYTE_STRING_MAX_LENGTH) {
    return null;
  }
  const trimmed = raw.trim();
  const match = BYTE_STRING_PATTERN.exec(trimmed);
  if (!match?.[1] || match[2] === undefined) {
    return null;
  }
  const multiplier = BYTE_UNIT_MULTIPLIERS[match[2].toLowerCase()];
  if (multiplier === undefined) {
    return null;
  }
  const bytes = Number.parseFloat(match[1]) * multiplier;
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  return Math.floor(bytes);
}

/**
 * Positive byte count. Accepts either:
 *   - a raw positive integer (`2147483648`)
 *   - a human-readable string (`"2gb"`, `"500 mb"`, `"256mib"`).
 *
 * The schema normalises both to a plain positive integer so consumers
 * only ever see numbers in the typed output.
 */
const BytesSchema = z
  .union([
    z.number().int().positive(),
    z.string().transform((raw, ctx) => {
      const parsed = parseByteString(raw);
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid byte size "${raw}". Expected a positive integer or a value like "500mb", "2gb", "256mib".`,
        });
        return z.NEVER;
      }
      return parsed;
    }),
  ])
  .describe(
    'Positive byte count. Either a raw integer (`2147483648`) or a human-readable string (`"2gb"`, `"500mb"`, `"256mib"`).'
  );

const FsResourcesSchema = z
  .object({
    /**
     * Per-call cap on the bytes a single `readFile` / `writeFile`
     * action can move. Mirrors the hub-level `DEFAULT_MAX_FILE_BYTES`
     * default; useful when a plugin legitimately needs to handle
     * larger payloads (e.g. media tooling) or wants to declare a
     * tighter cap for defence in depth.
     */
    maxFileBytes: z.optional(BytesSchema),
    /**
     * Per-root disk quotas. Each value caps the total bytes the
     * plugin can hold across the named virtual root. Omitted roots
     * fall back to the hub default.
     */
    quotas: z.optional(
      z
        .object({
          data: z.optional(BytesSchema),
          cache: z.optional(BytesSchema),
          tmp: z.optional(BytesSchema),
        })
        .describe('Per-root disk quota overrides — falls back to hub defaults when omitted.')
    ),
  })
  .describe('Filesystem-related resource caps for this plugin.');

const ResourcesSchema = z
  .object({
    fs: z.optional(FsResourcesSchema),
  })
  .describe(
    'Plugin-declared runtime resource caps. The hub clamps to its own absolute ceiling, so a plugin asking for outrageous values still bounded by the operator-trusted config.'
  );

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

  // Override: plugin runtime entrypoint is required by hub resolver
  main: z
    .string()
    .trim()
    .min(1, 'main must not be empty')
    .describe('Plugin entrypoint file, e.g. "./src/index.ts"'),

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
  displayName: z.optional(z.string().describe('Human-readable display name')),
  tools: z.optional(z.array(ToolSchema).describe('Tools provided by this plugin')),
  blocks: z.optional(z.array(BlockSchema).describe('Workflow blocks provided by this plugin')),
  sparks: z.optional(
    z.array(SparkSchema).describe('Typed event (spark) definitions provided by this plugin')
  ),
  bricks: z.optional(z.array(BrickSchema).describe('Board bricks provided by this plugin')),
  pages: z.optional(
    z.array(PageSchema).describe('Custom pages shown as tabs on the plugin detail view')
  ),
  icon: z.optional(z.string().describe('Path to plugin icon (PNG/SVG, relative to package root)')),
  preferences: z.optional(
    z.array(PreferenceSchema).describe('Plugin preferences/configuration schema')
  ),
  grants: z.optional(
    z
      .record(z.string(), z.unknown())
      .describe(
        'Grants requested by this plugin, keyed by reverse-DNS id (e.g. "dev.brika.net.fetch"). The value is the requested scope (e.g. { allow: ["api.example.com"] }). The permission family for each grant is read from the registered spec — there is no separate `permissions` field on the manifest.'
      )
  ),
  resources: z.optional(ResourcesSchema),
});

/**
 * TypeScript type for BRIKA plugin package.json
 */
export type PluginPackageSchema = z.infer<typeof PluginPackageSchema>;
