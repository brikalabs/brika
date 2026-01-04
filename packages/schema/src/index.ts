/**
 * @brika/schema
 * 
 * Unified schema package for BRIKA
 * - Zod schemas for runtime validation
 * - JSON schemas generated for IDE support
 * - Single source of truth
 */

export { 
  PluginPackageSchema, 
  validatePluginPackage, 
  assertPluginPackage,
  type PluginPackage 
} from "./plugin.ts";

