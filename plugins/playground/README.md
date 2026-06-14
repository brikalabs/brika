# @brika/plugin-playground

Experimental sandbox plugin — the reference example for first-party SDK
features. Used as:

- A guide when wiring blocks, preferences, actions, pages, or grants
  into your own plugin.
- A smoke-test target for the hub's permission / consent UI.
- A scratch surface for trying out new SDK features.

## What it ships

- **Echo block** ([`blocks/echo.ts`](src/blocks/echo.ts)) — passes
  input through to output with an optional `prefix` / `suffix` for
  string payloads, and emits an `echoed` spark on every tick.
- **Preferences showcase** ([`preferences.ts`](src/preferences.ts)) —
  every preference type the system supports (`password`, `text`,
  `number`, `checkbox`, `dropdown`), with `onInit` and
  `onPreferencesChange` wired up to log the current values.
- **File-browser page** ([`pages/file-browser.tsx`](src/pages/file-browser.tsx))
  — upload, preview, download, sort, create folder, delete, against the
  plugin's virtual `/data` directory. All filesystem ops go through the
  grant runtime; the operator approves the Filesystem family in the
  consent UI before the page becomes useful.

## Architecture

```
src/
├── index.ts                  manifest — imports submodules for their side effects
├── paths.ts                  shared /data jail (used by every fs surface)
├── preferences.ts            preferences hooks
├── blocks/
│   └── echo.ts               echo block + echoed spark
└── pages/
    ├── file-browser.tsx      page entry (thin shell + <FileBrowser />)
    └── file-browser/
        ├── actions.ts        plugin-process actions colocated with the page
        ├── types.ts          FsEntry, PreviewState, UploadItem, SortKey
        ├── FileBrowser.tsx   orchestrator: composes hooks + components
        ├── components/
        │   ├── EntryList.tsx     Clay table: skeleton / empty drop card /
        │   │                     in-flight upload rows / entry rows
        │   ├── EntryIcon.tsx     per-kind file + folder glyph
        │   ├── Toolbar.tsx       breadcrumb + sort Select + actions ButtonGroup
        │   ├── NewFolderInput.tsx  inline new-folder InputGroup
        │   ├── DirectoryTree.tsx   Clay Tree sidebar (lazy children)
        │   ├── PermissionGate.tsx  consent gate when fs grants are denied
        │   └── preview/          image / pdf / text / generic preview panel
        ├── lib/              path / size / time / sort / content-type helpers
        └── hooks/
            ├── use-directory.ts   entries / loading / permission state
            ├── use-dir-tree.ts    lazy sidebar tree state
            ├── use-uploads.ts     queue + sequential writeEntry loop;
            │                      errors toast, in-flight files list inline
            ├── use-delete.ts      delete + confirmation flow
            ├── use-folder-create.ts  create-folder action
            ├── use-download.ts    download an entry to disk
            └── use-preview.ts     read + materialise as blob URL / text
```

### Why actions, not routes

Every plugin↔page operation goes through **typed actions** (no `defineRoute`).
Actions are HTTP-JSON for normal payloads and **raw bytes** for binary
ones — the SDK helper `binaryResponse(bytes, contentType)` (and the
inverse: passing a `File` / `Blob` as the action input) lets the wire
carry binary natively. No base64. The hub marks binary HTTP responses
with an `X-Brika-Binary: 1` header so the page-side `useCallAction`
returns a `Blob` instead of trying to parse JSON.

### Why `/data` only

The plugin declares `dev.brika.fs.*` grants scoped to `/data/**` in
[`package.json`](package.json). The grant runtime enforces the scope at
the syscall level — the in-process `assertUnderData` helper in
[`paths.ts`](src/paths.ts) is just defence in depth so we fail fast
with a clear error before touching the filesystem.

### Resource caps (`resources.fs`)

The manifest declares the plugin's runtime caps so the operator sees
exactly what disk + per-call budget the plugin is asking for at install:

```jsonc
"resources": {
  "fs": {
    "maxFileBytes": "512mb",          // per readFile / writeFile
    "quotas": {
      "data":  "5gb",                 // total in /data
      "cache": "1gb",                 // /cache (evictable)
      "tmp":   "256mb"                // /tmp
    }
  }
}
```

Byte values accept either a raw integer (bytes) or a string with a
unit suffix — `kb`/`mb`/`gb`/`tb` (and their `kib`/`mib`/`gib`/`tib`
aliases) all use base-1024, matching the convention developers
expect for disk + memory limits. Examples: `"500mb"`, `"2gb"`,
`"1.5 GiB"`, `1073741824`.

Omitted fields fall back to hub-wide defaults defined in
[`apps/hub/src/runtime/plugins/grants/fs/types.ts`](../../apps/hub/src/runtime/plugins/grants/fs/types.ts).
Operators can still tune values per-plugin via hub config; the manifest
is the plugin's **request**, the hub-config is the **ceiling**.

### Memory model — currently buffered

Heads-up: `readFile` / `writeFile` actions buffer the **entire** payload
in memory at three stops — the plugin process (action handler), the hub
(IPC + HTTP), and the page (Blob backing the `<img>` / `<video>` / etc).
For a 100 MB video and a chatty operator that re-opens the same preview
ten times before GC catches up, that ladder can briefly hold ~1 GiB.

Mitigations already in place:
- The preview hook short-circuits when re-opening the same path
  ([`use-preview.ts`](src/pages/file-browser/hooks/use-preview.ts)) so
  re-clicking doesn't re-download.
- The blob URL is revoked the moment the preview kind transitions or
  the panel closes, so the browser can reclaim the underlying Blob.

True streaming reads / writes are tracked in the type comments
(`DEFAULT_MAX_FILE_BYTES` doc); they need a v2 action contract that
returns `ReadableStream` instead of `Uint8Array`. Until then, declare
a tighter `maxFileBytes` if your plugin doesn't actually need 512 MiB.

## Install

Add to your `.brika/brika.yml`:

```yaml
plugins:
  "@brika/plugin-playground":
    version: workspace:*
```
