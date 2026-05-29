# OAuth

`defineOAuth` is a complete OAuth 2.0 Authorization Code flow helper with built-in PKCE support, token storage, and an authenticated `fetch` wrapper. Use it for integrations that need to talk to provider APIs on behalf of the user (Spotify, Google, Microsoft, …).

## PKCE flow (recommended)

```ts
import { defineOAuth } from '@brika/sdk';

export const spotify = defineOAuth({
  id: 'spotify',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  scopes: ['user-read-playback-state', 'user-modify-playback-state'],
  clientId: 'your-spotify-client-id',
});

// In any handler — automatic refresh on expiry
const res = await spotify.fetch('https://api.spotify.com/v1/me/player');
const player = await res.json();
```

`defineOAuth` returns an `OAuthClient`:

```ts
interface OAuthClient {
  getAuthUrl(): string;       // hub-served `/api/oauth/<id>/authorize`
  getToken(): OAuthToken | null;
  isAuthenticated(): boolean;
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
```

PKCE is on by default. The client never needs to know a secret — the browser navigates to the provider, the provider redirects back to the hub's callback URL with a code, the hub exchanges the code with the verifier, the provider returns tokens, the hub stores them in the keychain.

## With a client secret (non-PKCE)

For providers that don't support PKCE or require a confidential client:

```ts
export const google = defineOAuth({
  id: 'google',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: ['profile', 'email'],
  clientIdPreference: 'clientId',
  clientSecretPreference: 'clientSecret',
  pkce: false,
});
```

When `clientIdPreference` / `clientSecretPreference` are set, the helper reads the values from the plugin's [preferences](preferences.md) — the user pastes them in via the UI. This is how to keep secrets out of source code.

## How it works

Behind the scenes, `defineOAuth` registers two routes on the hub:

* `GET /api/oauth/<id>/authorize` — redirects to the provider with the PKCE challenge.
* `GET /api/oauth/<id>/callback` — receives the auth code, exchanges it for tokens, persists them, closes the browser tab.

Token storage uses a `__secret_oauth_<id>_token` preference key — the hub routes it through the [Secret Store](../architecture/secret-store.md) so the access + refresh tokens land in the OS keychain rather than `brika.yml`.

## Authenticated requests

```ts
const res = await spotify.fetch('https://api.spotify.com/v1/me/player');
```

The `fetch` helper:

1. Reads the stored token.
2. If it's expired (or expires within 60 seconds), refreshes it. Concurrent refresh attempts are coalesced via a single-flight gate so providers that rotate refresh tokens (Spotify, Google, Microsoft) don't get racing refresh calls.
3. Adds `Authorization: Bearer <access_token>` to the request.
4. Calls the global `fetch` with the merged init.

Throws if the user is not authenticated (`Not authenticated. Visit /api/oauth/<id>/authorize to authorize.`).

## Connecting the user

Point them at the authorize URL — usually from a brick or page button:

```tsx
import { spotify } from '../oauth';

<a href={spotify.getAuthUrl()} target="_blank">Connect Spotify</a>
```

After they complete the flow the callback closes the tab automatically.

## Disconnecting

Delete the stored token via the preferences API:

```ts
import { setPreference } from '@brika/sdk';
setPreference('__secret_oauth_spotify_token', null);
```

Or use `deleteSecret('oauth_spotify_token')` if the plugin has the secrets grant.

## Permission

`defineOAuth` registers routes, so the plugin needs `"routes"` in its permissions. It also reads + writes preferences, which require no explicit grant.

If you store the access token via `setSecret` instead of preferences, add `"secrets"` too.

## Per-provider notes

* **Loopback redirect** — the hub normalises `localhost`/`0.0.0.0` to `127.0.0.1` in the redirect URI because Spotify and Google require the exact loopback form.
* **State + PKCE** — the helper generates a random state, holds the PKCE verifier in a bounded TTL map (10 minutes, max 64 entries), and evicts on lookup. Replay across a state value is rejected.

## See also

* **[Preferences](preferences.md)** — `clientIdPreference` and `clientSecretPreference`.
* **[Secrets](secrets.md)** — token storage.
* **[HTTP Routes](routes.md)** — underlying mechanism.
* **[Permissions](permissions.md)** — `routes` grant.
