/**
 * Grants registry error codes — thrown by `@brika/grants`'s
 * `GrantRegistry.dispatch`. Plugin code sees these as `BrikaError`
 * rejections from `ctx.foo.bar(args)` calls.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const GrantsCatalog = {
  ALREADY_REGISTERED: entry({
    title: 'Grant already registered',
    description: 'A grant with this id was registered twice on the hub.',
    typeUri: `${TYPE_BASE}grants/already-registered`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'This is a hub-side bug: two grant specs share the same id. Audit the registry-factory.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Grant "${data.grantId}" was already registered.`,
  }),
  NOT_REGISTERED: entry({
    title: 'Grant not registered',
    description: 'Dispatched against a grant id the hub does not know.',
    typeUri: `${TYPE_BASE}grants/not-registered`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Either a typo in `ctx.<path>` / the manifest grants map, or the plugin is built against a newer SDK than the hub supports.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Grant "${data.grantId}" is not registered with this hub.`,
  }),
  INVALID_OUTPUT: entry({
    title: 'Grant output failed schema validation',
    description: 'A grant handler returned a value that does not match its declared result schema.',
    typeUri: `${TYPE_BASE}grants/invalid-output`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'This is a hub-side programming error: the handler returned data the spec rejects. Audit the handler implementation.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Handler for "${data.grantId}" returned an invalid result.`,
  }),
  INVALID_SCOPE: entry({
    title: 'Grant scope failed schema validation',
    description: 'The permitted scope for this grant does not match the spec schema.',
    typeUri: `${TYPE_BASE}grants/invalid-scope`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The scope stored in StateStore drifted from the schema, or a malformed scope reached dispatch. The grant was dropped from the vector.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Invalid scope for grant "${data.grantId}".`,
  }),
} as const;
