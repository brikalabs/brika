/**
 * SDK grant specs.
 *
 * Each grant is a spec file (Zod schemas + permission gate + a placeholder
 * handler). The same spec is imported on both sides:
 *   - the SDK uses it to augment the `Ctx` interface so plugin code gets
 *     typed `ctx.foo.bar(args)` access;
 *   - the hub imports the spec and rebinds it with a real handler via
 *     `defineGrant(spec.spec, realHandler)` in
 *     `apps/hub/src/runtime/plugins/grants/<name>.ts`.
 *
 * Adding a new grant: create the file here, register the handler on the
 * hub side. No bridge interface to touch.
 */

export type {
  DnsLookupArgs,
  DnsLookupResult,
  DnsResolveMxArgs,
  DnsResolveMxResult,
  DnsResolveTxtArgs,
  DnsResolveTxtResult,
  DnsScope,
} from './dns';
export {
  DnsLookupArgsSchema,
  DnsLookupResultSchema,
  DnsResolveMxArgsSchema,
  DnsResolveMxResultSchema,
  DnsResolveTxtArgsSchema,
  DnsResolveTxtResultSchema,
  DnsScopeSchema,
  dnsLookup,
  dnsResolveMx,
  dnsResolveTxt,
} from './dns';
export type { FetchArgs, FetchResult, NetScope } from './net';
export { FetchArgsSchema, FetchResultSchema, NetScopeSchema, netFetch } from './net';
