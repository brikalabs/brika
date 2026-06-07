/**
 * Manifest error codes: plugin-package validation failures the hub
 * surfaces during install / load.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const ManifestCatalog = {
  PLUGIN_NOT_FOUND: entry({
    title: 'Plugin not found',
    description: 'Referenced plugin is not registered with the hub.',
    typeUri: `${TYPE_BASE}plugin-not-found`,
    status: 404,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:plugin_not_found',
    data: z.object({
      pluginId: z.string(),
    }),
    message: (data) => `Plugin not found: ${data.pluginId}`,
  }),
  PLUGIN_CONFIG_INVALID: entry({
    title: 'Plugin config invalid',
    description: 'Plugin config block in brika.yml failed schema validation.',
    typeUri: `${TYPE_BASE}plugin-config-invalid`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:plugin_config_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      pluginId: z.string(),
    }),
    message: (data) => `Plugin "${data.pluginId}" has invalid configuration.`,
  }),
  MANIFEST_INVALID: entry({
    title: 'Manifest invalid',
    description: 'Plugin package.json failed manifest schema validation.',
    typeUri: `${TYPE_BASE}manifest-invalid`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:manifest_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      manifestPath: z.string(),
    }),
    message: (data) => `Plugin manifest is invalid: ${data.manifestPath}`,
  }),
  MANIFEST_MISSING_MAIN: entry({
    title: 'Manifest missing entry point',
    description: 'Plugin manifest has no resolvable entry point.',
    typeUri: `${TYPE_BASE}manifest-missing-main`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:manifest_missing_main',
    data: z.object({
      manifestPath: z.string(),
    }),
    message: (data) => `Plugin manifest at "${data.manifestPath}" has no "main" entry point.`,
  }),
  PLUGIN_DEPS_INSTALL_FAILED: entry({
    title: 'Plugin dependency install failed',
    description: "Installing a standalone plugin's dependencies failed the frozen-lockfile check.",
    typeUri: `${TYPE_BASE}plugin-deps-install-failed`,
    status: 422,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    developerHint: 'Run `bun install` in the plugin directory to refresh its lockfile, then retry.',
    data: z.object({
      pluginName: z.string(),
      directory: z.string(),
      exitCode: z.number(),
    }),
    message: (data) =>
      `Dependency install for "${data.pluginName}" failed (exit ${data.exitCode}). Run \`bun install\` in ${data.directory}, then retry.`,
  }),
} as const;
