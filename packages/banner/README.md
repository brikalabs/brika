# @brika/banner

Terminal startup banners with ASCII art, subtitle and metadata box — used by every Brika CLI surface to print the same recognizable header on boot.

Two entry points:

- **`@brika/banner`** — `createBanner(opts)` returns a string. Use it anywhere you control stdout.
- **`@brika/banner/vite`** — `bannerPlugin(opts)` is a Vite plugin that prints the banner once at `buildStart` (dedups across watch reloads).

## Usage

```ts
import { createBanner } from '@brika/banner';

console.log(createBanner({
  title: 'BRIKA',
  subtitle: 'Build. Run. Integrate. Keep Automating.',
  metadata: {
    Version: '0.4.0',
    Package: '@brika/hub',
  },
}));
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { bannerPlugin } from '@brika/banner/vite';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    bannerPlugin({
      title: 'BRIKA',
      subtitle: 'Build. Run. Integrate. Keep Automating.',
      metadata: { Version: pkg.version, Package: pkg.name },
    }),
  ],
});
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | — | ASCII-art string (figlet font). |
| `subtitle` | — | Line printed under the art. |
| `metadata` | — | Key/value rows printed under the subtitle. |
| `font` | `'Slant'` | Figlet font name. |
| `borderStyle` | `'double'` | Boxen border preset. |
| `borderColor` | `'cyan'` | Boxen border color. |
| `padding` | `1` | Inside-box padding. |
| `margin` | `1` | Outside-box margin. |

## Dependencies

`boxen`, `chalk`, `figlet` for the ASCII rendering. `vite` is a peer of the `/vite` entry only.

## Consumers

The hub, UI, and console all print a banner via `bannerPlugin` (UI/Vite) or `createBanner` (CLI startup).
