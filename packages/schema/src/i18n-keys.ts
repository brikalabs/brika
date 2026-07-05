/**
 * The plugin i18n key model, shared by the SDK's verify-check and the
 * compiler's usage analysis (both derive from the same manifest, so the
 * builders live here in the leaf package).
 *
 * Sentence-bearing plugin metadata is displayed through the hub's i18n layer,
 * keyed by entity id with the manifest string as a last-resort fallback. The
 * key contract mirrors the host UI's `tp()` call sites:
 *
 *   blocks|sparks|bricks|tools|pages.<id>.name / .description
 *   preferences.<name>.title / .description / .options.<value>
 *   bricks.<id>.config.<field>.label / .description / .options.<value>
 *   fields.<configField>.label / .description   (workflow editor block forms)
 *
 * Everything here is runtime-zod-free (types only), so the compiler can pull
 * it into its edge-safe (V8 isolate / Worker) bundles.
 */

import type { PluginPackageSchema, PreferenceSchema } from './plugin';

/** A parsed locale bundle (`locales/<lang>/*.json`, deep-merged). */
export type TranslationBundle = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Every dot-path whose value is a leaf (anything but a plain object). */
export function leafKeys(bundle: TranslationBundle, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) {
      keys.push(...leafKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/** True when `path` resolves to a non-empty string in the bundle. */
export function hasI18nKey(bundle: TranslationBundle, path: string): boolean {
  let node: unknown = bundle;
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) {
      return false;
    }
    node = node[part];
  }
  return typeof node === 'string' && node.trim().length > 0;
}

interface NamedEntry {
  id: string;
  description?: string;
}

/** `<kind>.<id>.name` for every entry; `.description` when the manifest has one. */
function entityKeys(kind: string, entries: readonly NamedEntry[] | undefined): string[] {
  const keys: string[] = [];
  for (const entry of entries ?? []) {
    keys.push(`${kind}.${entry.id}.name`);
    if (entry.description !== undefined) {
      keys.push(`${kind}.${entry.id}.description`);
    }
  }
  return keys;
}

/**
 * A preference-shaped field (plugin preference or brick config entry) at
 * `base`: `<base>.<title field>` always, `.description` when the manifest has
 * one, `.options.<value>` per static dropdown option (option labels come from
 * i18n; see the schema's DropdownOption doc).
 */
function preferenceKeys(base: string, titleField: string, field: PreferenceSchema): string[] {
  const keys: string[] = [`${base}.${titleField}`];
  if (field.description !== undefined) {
    keys.push(`${base}.description`);
  }
  if (field.type === 'dropdown') {
    keys.push(...field.options.map((opt) => `${base}.options.${opt.value}`));
  }
  return keys;
}

/**
 * Every i18n key the manifest implies: entity names/descriptions, preference
 * titles (+ static dropdown option labels) and brick config field labels.
 */
export function manifestI18nKeys(pkg: PluginPackageSchema): string[] {
  const keys: string[] = [];
  if (pkg.displayName !== undefined) {
    keys.push('name');
  }
  if (pkg.description !== undefined) {
    keys.push('description');
  }
  keys.push(
    ...entityKeys('blocks', pkg.blocks),
    ...entityKeys('sparks', pkg.sparks),
    ...entityKeys('tools', pkg.tools),
    ...entityKeys('pages', pkg.pages),
    ...entityKeys('bricks', pkg.bricks)
  );
  for (const pref of pkg.preferences ?? []) {
    keys.push(...preferenceKeys(`preferences.${pref.name}`, 'title', pref));
  }
  for (const brick of pkg.bricks ?? []) {
    for (const field of brick.config ?? []) {
      keys.push(...preferenceKeys(`bricks.${brick.id}.config.${field.name}`, 'label', field));
    }
  }
  // Blocks WITHOUT a custom config view render the generic schema-driven form,
  // which labels every config field via `fields.<name>.label`. Blocks with
  // `view: true` own their config UI, so their fields need no generic labels.
  for (const block of pkg.blocks ?? []) {
    if (block.view === true) {
      continue;
    }
    for (const field of block.fields ?? []) {
      keys.push(`fields.${field}.label`);
    }
  }
  return [...new Set(keys)];
}

/**
 * The full key families a declared entity legitimately owns, beyond the
 * required set: the UI looks up `.description` (and preference/config
 * `.description`) unconditionally with the manifest string as fallback, so a
 * locale may provide them even when the manifest omits the field. Used by the
 * unused-key analysis to avoid flagging legitimate keys; NOT part of the
 * required set `manifestI18nKeys` builds.
 */
export function impliedI18nKeys(pkg: PluginPackageSchema): string[] {
  const keys: string[] = ['name', 'description'];
  const kinds: Array<[string, ReadonlyArray<{ id: string }> | undefined]> = [
    ['blocks', pkg.blocks],
    ['sparks', pkg.sparks],
    ['tools', pkg.tools],
    ['pages', pkg.pages],
    ['bricks', pkg.bricks],
  ];
  for (const [kind, entries] of kinds) {
    for (const entry of entries ?? []) {
      keys.push(`${kind}.${entry.id}.name`, `${kind}.${entry.id}.description`);
    }
  }
  for (const pref of pkg.preferences ?? []) {
    keys.push(`preferences.${pref.name}.title`, `preferences.${pref.name}.description`);
  }
  // Every declared block config field may carry a label AND a description
  // (the editor looks both up), custom-view blocks included.
  for (const block of pkg.blocks ?? []) {
    for (const field of block.fields ?? []) {
      keys.push(`fields.${field}.label`, `fields.${field}.description`);
    }
  }
  return [...new Set(keys)];
}

/**
 * Key prefixes the host resolves with RUNTIME-computed tails, so static
 * analysis must treat everything under them as used:
 *
 *   - `blocks.<id>.ports.` — port names/descriptions come from the block's
 *     registration message, not the manifest;
 *   - `preferences.<n>.options.` / `bricks.<id>.config.<f>.` — dropdown
 *     option values may be fetched at runtime (dynamic dropdowns), and config
 *     fields own their whole label/description/options family;
 *   - `fields.<name>.` for every declared block config field. The blanket
 *     `fields.` prefix applies only to manifests generated before `brika
 *     build` recorded field names (no block carries a `fields` array), so a
 *     current build gets exact checking and an older one stays quiet.
 */
export function runtimeResolvedI18nPrefixes(pkg: PluginPackageSchema): string[] {
  const prefixes: string[] = [];
  // An ABSENT tools array means the manifest predates tool collection, so
  // tool ids are unknown; an empty array declares "no tools" and gets exact
  // checking like everything else.
  if (pkg.tools === undefined) {
    prefixes.push('tools.');
  }
  const blocks = pkg.blocks ?? [];
  if (blocks.length > 0 && blocks.every((block) => block.fields === undefined)) {
    prefixes.push('fields.');
  }
  for (const block of blocks) {
    prefixes.push(`blocks.${block.id}.ports.`);
    for (const field of block.fields ?? []) {
      prefixes.push(`fields.${field}.`);
    }
  }
  for (const pref of pkg.preferences ?? []) {
    prefixes.push(`preferences.${pref.name}.options.`);
  }
  for (const brick of pkg.bricks ?? []) {
    for (const field of brick.config ?? []) {
      prefixes.push(`bricks.${brick.id}.config.${field.name}.`);
    }
  }
  return prefixes;
}

/**
 * Root keys that are always legitimate regardless of the manifest: the plugin
 * listing strings (`name`/`description` in plugin.json, `title`/`description`
 * in the bundled store.json, which the hub merges into the same namespace).
 */
export const RESERVED_I18N_KEYS: readonly string[] = ['name', 'description', 'title'];
