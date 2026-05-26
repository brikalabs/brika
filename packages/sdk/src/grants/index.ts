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
export type {
  BrikaFsRuntime,
  FsDirEntry,
  FsExistsArgs,
  FsExistsResult,
  FsMkdirArgs,
  FsMkdirResult,
  FsPath,
  FsReaddirArgs,
  FsReaddirResult,
  FsReadFileArgs,
  FsReadFileResult,
  FsRmArgs,
  FsRmResult,
  FsScope,
  FsStatArgs,
  FsStatResult,
  FsWriteFileArgs,
  FsWriteFileResult,
  VirtualRoot,
} from './fs';
export {
  FsDirEntrySchema,
  FsExistsArgsSchema,
  FsExistsResultSchema,
  FsMkdirArgsSchema,
  FsMkdirResultSchema,
  FsPathSchema,
  FsPatternSchema,
  FsReaddirArgsSchema,
  FsReaddirResultSchema,
  FsReadFileArgsSchema,
  FsReadFileResultSchema,
  FsRmArgsSchema,
  FsRmResultSchema,
  FsScopeSchema,
  FsStatArgsSchema,
  FsStatResultSchema,
  FsWriteFileArgsSchema,
  FsWriteFileResultSchema,
  fsExists,
  fsMkdir,
  fsReaddir,
  fsReadFile,
  fsRm,
  fsStat,
  fsWriteFile,
  VIRTUAL_ROOTS,
} from './fs';
export type {
  LocationGetArgs,
  LocationGetResult,
  LocationScope,
} from './location';
export {
  LocationGetArgsSchema,
  LocationGetResultSchema,
  LocationScopeSchema,
  locationGet,
} from './location';
export type { FetchArgs, FetchResult, NetScope } from './net';
export { FetchArgsSchema, FetchResultSchema, NetScopeSchema, netFetch } from './net';
export type {
  SecretsDeleteArgs,
  SecretsDeleteResult,
  SecretsGetArgs,
  SecretsGetResult,
  SecretsScope,
  SecretsSetArgs,
  SecretsSetResult,
} from './secrets';
export {
  SecretKeySchema,
  SecretsDeleteArgsSchema,
  SecretsDeleteResultSchema,
  SecretsGetArgsSchema,
  SecretsGetResultSchema,
  SecretsScopeSchema,
  SecretsSetArgsSchema,
  SecretsSetResultSchema,
  secretsDelete,
  secretsGet,
  secretsSet,
} from './secrets';
export type { UiPickFileArgs, UiPickFileResult, UiScope } from './ui';
export { UiPickFileArgsSchema, UiPickFileResultSchema, UiScopeSchema, uiPickFile } from './ui';
export type {
  WsCloseArgs,
  WsCloseResult,
  WsConnectArgs,
  WsConnectResult,
  WsScope,
  WsSendArgs,
  WsSendResult,
} from './ws';
export {
  WsCloseArgsSchema,
  WsCloseResultSchema,
  WsConnectArgsSchema,
  WsConnectResultSchema,
  WsScopeSchema,
  WsSendArgsSchema,
  WsSendResultSchema,
  wsClose,
  wsConnect,
  wsSend,
} from './ws';
