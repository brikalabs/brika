# Location

Brika hubs have a configured location (latitude, longitude, optional address). Plugins that care — weather, sunrise/sunset, presence detection — read it via `getDeviceLocation`.

```ts
import { getDeviceLocation } from '@brika/sdk';

const loc = await getDeviceLocation();
if (loc) {
  console.log(`Located in ${loc.city}, ${loc.country}`);
  fetchWeather(loc.latitude, loc.longitude);
}
```

The return shape:

```ts
interface DeviceLocation {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
}
```

Returns `null` if the user has not configured a location.

## Permission

Add `"location"` to your plugin's `permissions` array in `package.json`. Without it, `getDeviceLocation` throws `PermissionDeniedError`.

```json
"permissions": ["location"]
```

## Source

The location is set during the hub's setup flow (or later in **Settings → Location**) and persisted in the hub's state store. It does not refresh automatically — the user has to update it explicitly.

There is no per-plugin caching layer in the SDK; each call goes over IPC. Cache the result in your plugin if you need to refer to it repeatedly.

## In bricks

Bricks cannot call `getDeviceLocation` directly — they run in the browser. If you need the location in a brick, push it from the plugin process via [`setBrickData`](bricks.md) or expose it through an [action](actions.md).

## See also

* **[Permissions](permissions.md)** — the `"location"` grant.
* **[Lifecycle](lifecycle.md)** — call `getDeviceLocation` from `onInit` to cache the location at startup.
