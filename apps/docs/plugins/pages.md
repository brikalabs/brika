# Pages

A page is a **full-screen React route** owned by a plugin. The hub mounts it in the UI sidebar under the plugin's name, and the page can use the full brick UI primitives plus extra hooks for calling actions and reading translations.

Use pages for plugin admin UIs: a Spotify connection panel, a Matter device pairing wizard, a "browse the plugin's data" view. For dashboard cards that sit alongside other plugins' cards, use [bricks](bricks.md) instead.

## File layout

```
src/pages/
  devices.tsx
  settings.tsx
```

One file per page, default export is the React component. Declare them in the manifest:

```json
"pages": [
  { "id": "devices", "name": "Devices", "icon": "cpu" },
  { "id": "settings", "name": "Settings", "icon": "cog" }
]
```

The hub mounts them at `/p/<plugin-uid>/<page-id>` and adds them to the UI sidebar with the icon and name you specified.

## A minimal page

```tsx
import { useAction, useCallAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { listDevices, scan } from '../actions';

export default function DevicesPage() {
  const { t } = useLocale();
  const { data, loading, refetch } = useAction(listDevices);
  const call = useCallAction();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{t('devices.title')}</h1>
      <button
        className="mt-2 rounded bg-primary px-3 py-1.5 text-primary-foreground"
        onClick={() => call(scan).then(refetch)}
      >
        {t('devices.scan')}
      </button>
      {loading && <p>Loading…</p>}
      {data?.map((d) => (
        <div key={d.id}>{d.name}</div>
      ))}
    </div>
  );
}
```

The page imports actions (typed RPCs to the plugin process) from a sibling file, uses `useAction` for fetch-on-mount and `useCallAction` for explicit invocations. See [Actions](actions.md).

## Hooks available in pages

All from `@brika/sdk/ui-kit/hooks`:

| Hook | Description |
|---|---|
| `useAction(ref)` | Fetch-on-mount: `{ data, loading, error, refetch }` |
| `useCallAction()` | Stable callback to invoke an action with optional input |
| `useLocale()` | `{ t, locale, changeLocale, formatDate, formatTime, formatNumber }` |
| `usePluginUid()` | The plugin's UID (`brika.plugin-foo`) |
| `usePluginRouteUrl(path)` | Builds `/api/plugins/:uid/routes/<path>` for HTTP routes |

Plus the entire React hook suite, of course.

## Bricks and pages share the bridge

Pages are loaded by the same compiler pipeline as bricks. Imports from `react`, `react/jsx-runtime`, `lucide-react`, `@brika/sdk/ui-kit*`, `clsx`, and `class-variance-authority` are rewritten to `globalThis.__brika.*` and served from the host UI. Tailwind classes are scoped per page. See [Externals Rewrite](../architecture/externals-rewrite.md).

The key difference vs bricks: pages **do not** have `useBrickData`, `useBrickConfig`, `useBrickSize`, or `useCallBrickAction` — those are brick-specific. Pages communicate with the server via actions and HTTP routes.

## Linking from the rest of the UI

If you need to point users to a page from another part of your plugin (a brick, a notification, a settings panel), use the plugin route URL helper:

```tsx
const url = `/p/${usePluginUid()}/devices`;
```

## See also

* **[Bricks](bricks.md)** — dashboard cards (different host, mostly similar primitives).
* **[Actions](actions.md)** — server-side RPCs.
* **[HTTP Routes](routes.md)** — for arbitrary HTTP endpoints when actions aren't enough.
* **[Internationalization](i18n.md)** — `useLocale` and the translation pipeline.
