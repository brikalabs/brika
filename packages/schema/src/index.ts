/**
 * @brika/schema — the plugin contract package.
 *
 * The dependency-free leaf every layer shares: the package.json manifest
 * schema and its entity schemas (`./plugin`), the build-time collect contract
 * (`./collect`, `./collect-sink`), the i18n key model (`./i18n-keys`), the
 * browser bridge globals (`./browser-bridge`), the fs runtime contract
 * (`./fs-runtime`), and the human-friendly config units below. JSON Schemas
 * for IDE `$schema` support are generated from `./plugin`.
 */

export * from './plugin';
export {
  BytesSchema,
  DurationSchema,
  formatBytes,
  formatDuration,
  parseByteString,
  parseDurationString,
} from './units';
