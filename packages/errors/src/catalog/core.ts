/**
 * Core error codes — generic platform faults thrown anywhere in the
 * stack. Every other family inherits the same `entry()` shape and
 * surfaces here when no more specific code fits.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const CoreCatalog = {
  INTERNAL: entry({
    title: 'Internal error',
    description: 'Unexpected server-side failure.',
    typeUri: `${TYPE_BASE}internal`,
    status: 500,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: true,
    i18nKey: 'errors:internal',
    developerHint: 'Check server logs for the underlying cause chain.',
    data: undefined,
    message: () => 'An internal error occurred.',
  }),
  INVALID_INPUT: entry({
    title: 'Invalid input',
    description: 'Request input failed validation.',
    typeUri: `${TYPE_BASE}invalid-input`,
    status: 400,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:invalid_input',
    developerHint:
      'Inspect `data.field` (when present) and the cause chain for the Zod issue list.',
    data: z.object({
      field: z.string().optional(),
    }),
    message: (data) => (data.field ? `Invalid input for "${data.field}"` : 'Invalid input.'),
  }),
  NOT_FOUND: entry({
    title: 'Not found',
    description: 'Requested resource does not exist.',
    typeUri: `${TYPE_BASE}not-found`,
    status: 404,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:not_found',
    data: z.object({
      resource: z.string(),
    }),
    message: (data) => `Resource "${data.resource}" not found.`,
  }),
  PERMISSION_DENIED: entry({
    title: 'Permission denied',
    description: 'A required permission was not granted.',
    typeUri: `${TYPE_BASE}permission-denied`,
    status: 403,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:permission_denied',
    developerHint: 'Add the named permission to your plugin manifest and reload the plugin.',
    data: z.object({
      permission: z.string(),
    }),
    message: (data) =>
      `Permission "${data.permission}" is required but not granted. ` +
      `Add "${data.permission}" to "permissions" in your plugin's package.json.`,
  }),
  TIMEOUT: entry({
    title: 'Timeout',
    description: 'Operation exceeded its allotted time.',
    typeUri: `${TYPE_BASE}timeout`,
    status: 504,
    severity: 'error',
    category: 'core',
    retryable: true,
    transient: true,
    i18nKey: 'errors:timeout',
    data: z.object({
      operation: z.string().optional(),
      timeoutMs: z.number().int().nonnegative().optional(),
    }),
    message: (data) => formatTimeoutMessage(data),
  }),
  UNAVAILABLE: entry({
    title: 'Service unavailable',
    description: 'A required dependency or service is unavailable.',
    typeUri: `${TYPE_BASE}unavailable`,
    status: 503,
    severity: 'error',
    category: 'core',
    retryable: true,
    transient: true,
    i18nKey: 'errors:unavailable',
    data: undefined,
    message: () => 'A required service is unavailable.',
  }),
} as const;

function formatTimeoutMessage(data: {
  readonly operation?: string;
  readonly timeoutMs?: number;
}): string {
  if (data.operation && typeof data.timeoutMs === 'number') {
    return `Operation "${data.operation}" timed out after ${data.timeoutMs}ms.`;
  }
  if (data.operation) {
    return `Operation "${data.operation}" timed out.`;
  }
  if (typeof data.timeoutMs === 'number') {
    return `Operation timed out after ${data.timeoutMs}ms.`;
  }
  return 'Operation timed out.';
}
