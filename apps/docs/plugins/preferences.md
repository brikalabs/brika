# Preferences

Preferences are the plugin's top-level configuration — the form the user fills in on the plugin's settings panel. Defined in the manifest, persisted to `brika.yml`, validated against the schema, and delivered to the plugin process via IPC.

## Declaring preferences

In `package.json`:

```json
"preferences": [
  {
    "type": "text",
    "name": "apiKey",
    "label": "API key",
    "description": "Your Coingecko API key",
    "secret": true
  },
  {
    "type": "dropdown",
    "name": "fiat",
    "label": "Display currency",
    "default": "usd",
    "options": [
      { "value": "usd", "label": "USD" },
      { "value": "eur", "label": "EUR" }
    ]
  },
  {
    "type": "dynamic-dropdown",
    "name": "defaultSymbol",
    "label": "Default coin",
    "description": "Loaded at runtime"
  }
]
```

Field types: `text`, `multiline`, `number`, `slider`, `checkbox`, `dropdown`, `dynamic-dropdown`. See [Manifest Reference](manifest.md) for every option.

`secret: true` on a field tells the hub to store the value in the [Secret Store](../architecture/secret-store.md) instead of in plain text in `brika.yml`. The YAML gets a `__secret_<name>: null` sentinel so the diff still shows the presence of a secret.

## Reading preferences

```ts
import { getPreferences } from '@brika/sdk';

interface Prefs { apiKey: string; fiat: 'usd' | 'eur' }

const prefs = getPreferences<Prefs>();
console.log(prefs.fiat);
```

`getPreferences` returns the values the hub last pushed. It is synchronous — the hub guarantees preferences are delivered before `onInit` runs.

## Reacting to changes

```ts
import { onPreferencesChange } from '@brika/sdk';

onPreferencesChange<Prefs>((next) => {
  api.setKey(next.apiKey);
});
```

Fires every time the hub re-delivers preferences — when the user edits them via the UI, or when an external process writes to `brika.yml` and the hub re-reads it. Does **not** require restarting the plugin process; preferences hot-reload across IPC.

The returned function unsubscribes. Useful if you register handlers conditionally.

## Updating from the plugin

```ts
import { setPreference } from '@brika/sdk';

setPreference('fiat', 'eur');
```

Persists the change through the hub and re-pushes the new preferences object to every subscriber (including yourself). Useful when the plugin discovers a default the user should adopt — for example, an OAuth flow that picks a default account.

## Dynamic dropdowns

For preferences whose options depend on runtime state (a list of OAuth-authorised accounts, devices discovered on the network), declare a `dynamic-dropdown` and supply a provider:

```ts
import { definePreferenceOptions } from '@brika/sdk';

definePreferenceOptions('defaultSymbol', async () => {
  const coins = await api.listCoins();
  return coins.map((c) => ({ value: c.id, label: `${c.name} (${c.symbol})` }));
});
```

The hub calls the provider when the UI is about to render the field. Providers may return synchronously or asynchronously; cache results yourself if the lookup is expensive.

## Per-block / per-brick config vs preferences

* **Preferences** are plugin-wide. One value for all instances. Defined in the manifest's `preferences` array. Used for API keys, default behaviour, integration credentials.
* **Block config** is per-block instance. Defined in `defineReactiveBlock({ config: z.object({…}) })`. The user fills it in on each workflow node.
* **Brick config** is per-brick instance. Defined in the manifest's `bricks[*].config`. The user fills it in on each board card.

If your plugin's settings are global, use preferences. If they vary by usage, push them to block or brick config.

## See also

* **[Manifest Reference](manifest.md)** — the `preferences` field schema.
* **[Secrets](secrets.md)** — when to use `setSecret` instead of a `secret: true` preference.
* **[Secret Store](../architecture/secret-store.md)** — how secret preferences end up in the OS keychain.
