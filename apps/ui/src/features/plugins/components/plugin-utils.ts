import type { Plugin, PluginError } from '@brika/plugin';

export function getAuthorName(plugin: Plugin) {
  if (!plugin.author) return null;
  if (typeof plugin.author === 'string') return plugin.author;
  return plugin.author.name;
}

export function getRepoUrl(plugin: Plugin) {
  if (!plugin.repository) return null;
  if (typeof plugin.repository === 'string') return plugin.repository;
  return plugin.repository.url;
}

/**
 * Translate a structured PluginError using its i18n key + params,
 * falling back to the pre-built English message.
 */
export function formatPluginError(
  error: PluginError,
  t: (key: string, opts?: Record<string, string>) => string
): string {
  const translated = t(error.key, error.params);
  // If the key wasn't found, i18next returns the key itself — fall back to message
  return translated === error.key ? error.message : translated;
}
