/**
 * @brika/schema
 *
 * Unified schema package for BRIKA
 * - Zod schemas for runtime validation
 * - JSON schemas generated for IDE support
 * - Single source of truth
 */

export type {
  PluginPackageSchema as PluginPackageSchemaType,
  PreferenceSchema as PreferenceSchemaType,
} from './plugin';
export { PluginPackageSchema } from './plugin';
