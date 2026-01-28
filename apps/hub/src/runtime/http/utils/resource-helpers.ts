/**
 * HTTP Resource Helpers
 *
 * Common utilities for resource retrieval in HTTP routes.
 */
import { NotFound } from '@brika/router';

/**
 * Get a resource or throw a NotFound error.
 * Simplifies the common pattern of "get resource, check null, throw if missing".
 *
 * @example
 * const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
 * const workflow = getOrThrow(inject(WorkflowEngine).get(id), 'Workflow not found');
 */
export function getOrThrow<T>(resource: T | null | undefined, message: string): T {
  if (resource == null) throw new NotFound(message);
  return resource;
}
