/**
 * Hub-side `ctx.dns.*` grant family.
 *
 * One entry point that registers every dns verb. All three grants share
 * one permission family (`dns`), so an operator who allow-lists
 * `*.example.com` for dns gets the same hosts accepted across `lookup`,
 * `resolveTxt`, and `resolveMx`.
 *
 * Per-method handlers live in sibling files so each is small and easy
 * to audit; this file only wires them together.
 */

import type { Grant } from '@brika/grants';
import { buildLookupGrant, type DnsLookupResolver, defaultLookupResolver } from './lookup';
import { buildResolveMxGrant, type DnsMxResolver, defaultMxResolver } from './resolve-mx';
import { buildResolveTxtGrant, type DnsTxtResolver, defaultTxtResolver } from './resolve-txt';

export type { DnsLookupResolver } from './lookup';
export type { DnsMxResolver } from './resolve-mx';
export type { DnsTxtResolver } from './resolve-txt';

export interface DnsGrantOptions {
  readonly lookup?: DnsLookupResolver;
  readonly resolveTxt?: DnsTxtResolver;
  readonly resolveMx?: DnsMxResolver;
}

export function buildDnsGrants(opts?: DnsGrantOptions): ReadonlyArray<Grant> {
  return [
    buildLookupGrant(opts?.lookup ?? defaultLookupResolver),
    buildResolveTxtGrant(opts?.resolveTxt ?? defaultTxtResolver),
    buildResolveMxGrant(opts?.resolveMx ?? defaultMxResolver),
  ];
}
