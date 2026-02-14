# Spotify Connect

Spotify playback controller for BRIKA dashboards. Displays now-playing info, album art, and provides full transport controls via the Spotify Web API.

## Setup

1. Create an app at [developer.spotify.com](https://developer.spotify.com)
2. Add `http://127.0.0.1:3001/api/oauth/spotify/callback` as a **Redirect URI** in your Spotify app settings
3. In BRIKA, go to the plugin preferences and paste your **Client ID**
4. Click the **Connect** link to authorize

> Uses PKCE — no client secret needed.

## Brick: Spotify Player

Responsive player that adapts to the grid size:

| Size     | Layout                                             |
|----------|----------------------------------------------------|
| 1-2 cols | Album art with play/pause overlay                  |
| 3-4 cols | Album art background with floating control panel   |
| 5+ cols  | Split layout — album art left, full controls right |

Height unlocks additional features:

- **h >= 3** (medium layout): seek slider
- **h >= 4**: volume slider
- **h >= 5** (large layout): device name badge

### Config

| Name              | Type   | Default | Description                         |
|-------------------|--------|---------|-------------------------------------|
| `refreshInterval` | number | 3000    | Polling interval in ms (1000–30000) |

Progress is interpolated locally between polls for smooth UI updates.

## Spark: Track Changed

Emitted whenever the playing track changes.

**Payload:**

| Field        | Type           | Description                     |
|--------------|----------------|---------------------------------|
| `trackName`  | string         | Track title                     |
| `artistName` | string         | Artist name(s), comma-separated |
| `albumName`  | string         | Album title                     |
| `albumArt`   | string \| null | Album art URL (640px)           |
| `timestamp`  | number         | Unix timestamp (ms)             |

## Scopes

- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
