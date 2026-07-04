# @brika/plugin-playground

Plugin bac à sable expérimental — l'exemple de référence pour les
fonctionnalités du SDK first-party. Utilisé comme :

- Un guide pour brancher des blocks, des préférences, des actions, des
  pages ou des grants dans votre propre plugin.
- Une cible de test de fumée pour l'UI de permission / consentement du hub.
- Une surface d'expérimentation pour essayer les nouvelles fonctionnalités
  du SDK.

## Ce qu'il embarque

- **Block Echo** ([`blocks/echo.ts`](src/blocks/echo.ts)) — transmet
  l'entrée vers la sortie avec un `prefix` / `suffix` optionnel pour les
  charges utiles de type chaîne, et émet un spark `echoed` à chaque tick.
- **Vitrine des préférences** ([`preferences.ts`](src/preferences.ts)) —
  chaque type de préférence pris en charge par le système (`password`, `text`,
  `number`, `checkbox`, `dropdown`), avec `onInit` et
  `onPreferencesChange` branchés pour journaliser les valeurs courantes.
- **Page explorateur de fichiers** ([`pages/file-browser.tsx`](src/pages/file-browser.tsx))
  — téléverser, prévisualiser, télécharger, trier, créer un dossier, supprimer, sur
  le répertoire virtuel `/data` du plugin. Toutes les opérations de système de
  fichiers passent par le runtime de grants ; l'opérateur approuve la famille
  Filesystem dans l'UI de consentement avant que la page ne devienne utile.

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

### Pourquoi des actions, pas des routes

Chaque opération plugin↔page passe par des **actions typées** (pas de `defineRoute`).
Les actions sont en HTTP-JSON pour les charges utiles normales et en **octets bruts**
pour les charges binaires — l'assistant du SDK `binaryResponse(bytes, contentType)`
(et l'inverse : passer un `File` / `Blob` en entrée d'action) permet au canal de
transporter du binaire nativement. Pas de base64. Le hub marque les réponses HTTP
binaires avec un en-tête `X-Brika-Binary: 1` afin que, côté page, `useCallAction`
retourne un `Blob` au lieu d'essayer de parser du JSON.

### Pourquoi `/data` seulement

Le plugin déclare des grants `dev.brika.fs.*` limités à `/data/**` dans
[`package.json`](package.json). Le runtime de grants applique cette portée au
niveau des appels système — l'assistant en-processus `assertUnderData` dans
[`paths.ts`](src/paths.ts) n'est qu'une défense en profondeur pour échouer vite
avec une erreur claire avant de toucher au système de fichiers.

### Plafonds de ressources (`resources.fs`)

Le manifest déclare les plafonds d'exécution du plugin afin que l'opérateur voie
exactement quel budget disque + par-appel le plugin demande à l'installation :

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

Les valeurs en octets acceptent soit un entier brut (octets) soit une chaîne
avec un suffixe d'unité — `kb`/`mb`/`gb`/`tb` (et leurs alias
`kib`/`mib`/`gib`/`tib`) utilisent tous la base-1024, conformément à la
convention à laquelle les développeurs s'attendent pour les limites disque +
mémoire. Exemples : `"500mb"`, `"2gb"`, `"1.5 GiB"`, `1073741824`.

Les champs omis reprennent les valeurs par défaut à l'échelle du hub définies dans
[`apps/hub/src/runtime/plugins/grants/fs/types.ts`](../../apps/hub/src/runtime/plugins/grants/fs/types.ts).
Les opérateurs peuvent toujours ajuster les valeurs par plugin via la config du
hub ; le manifest est la **demande** du plugin, la config du hub est le **plafond**.

### Modèle mémoire — actuellement bufferisé

Attention : les actions `readFile` / `writeFile` bufferisent la charge utile
**entière** en mémoire à trois endroits — le processus du plugin (handler
d'action), le hub (IPC + HTTP) et la page (le Blob qui adosse la `<img>` /
`<video>` / etc). Pour une vidéo de 100 Mo et un opérateur bavard qui rouvre la
même prévisualisation dix fois avant que le GC ne rattrape son retard, cette
cascade peut brièvement retenir ~1 GiB.

Mesures d'atténuation déjà en place :
- Le hook de prévisualisation court-circuite lorsqu'on rouvre le même chemin
  ([`use-preview.ts`](src/pages/file-browser/hooks/use-preview.ts)) afin qu'un
  re-clic ne relance pas le téléchargement.
- L'URL du blob est révoquée dès que le type de prévisualisation change ou que
  le panneau se ferme, pour que le navigateur puisse récupérer le Blob sous-jacent.

Les véritables lectures / écritures en streaming sont suivies dans les commentaires
de types (doc `DEFAULT_MAX_FILE_BYTES`) ; elles nécessitent un contrat d'action v2
qui retourne un `ReadableStream` au lieu d'un `Uint8Array`. En attendant, déclarez
un `maxFileBytes` plus serré si votre plugin n'a pas réellement besoin de 512 MiB.

## Installation

Ajoutez à votre `.brika/brika.yml` :

```yaml
plugins:
  "@brika/plugin-playground":
    version: workspace:*
```
