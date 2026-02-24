/**
 * Zod v4 schemas for the verified plugins registry (v2).
 */
import { z } from 'zod';

/** npm-style package name pattern */
export const npmNamePattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Plugin categories */
export const PluginCategory = z.enum([
  'official',
  'community',
  'utility',
  'integration',
  'workflow',
]);
export type PluginCategory = z.infer<typeof PluginCategory>;

/** Plugin source — where the package is hosted */
export const PluginSource = z.enum(['npm', 'github', 'url']);
export type PluginSource = z.infer<typeof PluginSource>;

/** A single verified plugin entry in the registry. */
export const VerifiedPluginSchema = z.object({
  name: z.string().regex(npmNamePattern, 'Must be a valid npm package name'),
  verifiedAt: z.iso.datetime(),
  verifiedBy: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  minVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  featured: z.boolean().default(false),
  category: PluginCategory.default('community'),
  source: PluginSource.default('npm'),
  signature: z.string().optional(),
});
export type VerifiedPlugin = z.infer<typeof VerifiedPluginSchema>;

/** The full verified plugins registry document. */
export const VerifiedPluginsListSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  lastUpdated: z.iso.datetime(),
  publicKey: z.string().optional(),
  signature: z.string().optional(),
  plugins: z.array(VerifiedPluginSchema),
});
export type VerifiedPluginsList = z.infer<typeof VerifiedPluginsListSchema>;

/**
 * Extract the signable payload from a plugin entry (everything except `signature`).
 * Fields are explicitly picked to ensure canonical form stability.
 */
export function extractPluginSignablePayload(
  plugin: VerifiedPlugin
): Omit<VerifiedPlugin, 'signature'> {
  return {
    name: plugin.name,
    verifiedAt: plugin.verifiedAt,
    verifiedBy: plugin.verifiedBy,
    description: plugin.description,
    tags: plugin.tags,
    ...(plugin.minVersion === undefined ? {} : { minVersion: plugin.minVersion }),
    featured: plugin.featured,
    category: plugin.category,
    source: plugin.source,
  };
}

/**
 * Extract the signable payload from the registry (everything except `$schema` and `signature`).
 * Plugins are included WITH their individual signatures (chain of trust).
 */
export function extractRegistrySignablePayload(
  registry: VerifiedPluginsList
): Omit<VerifiedPluginsList, '$schema' | 'signature'> {
  return {
    version: registry.version,
    lastUpdated: registry.lastUpdated,
    ...(registry.publicKey === undefined ? {} : { publicKey: registry.publicKey }),
    plugins: registry.plugins,
  };
}
