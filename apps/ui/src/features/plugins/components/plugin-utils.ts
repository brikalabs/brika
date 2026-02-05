import type { Plugin } from '../api';

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
