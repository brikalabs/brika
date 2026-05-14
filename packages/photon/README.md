# @brika/photon

Sharp-like image-processing API powered by [@cf-wasm/photon](https://github.com/cf-wasm/photon) — a Rust/WASM implementation of [Photon](https://silvia-odwyer.github.io/photon/) that runs everywhere Bun and the browser do, with no native binaries to compile.

Use it when you want a fluent `sharp()`-style pipeline without the libvips dependency.

## Quick start

```ts
import { photon } from '@brika/photon';

const png = await photon(inputBytes)
  .resize({ width: 256, fit: 'cover' })
  .grayscale()
  .toFormat('webp', { quality: 82 })
  .toBuffer();
```

## API

| Method                                  | Notes                                       |
| --------------------------------------- | ------------------------------------------- |
| `resize({ width?, height?, fit? })`     | `fit`: `cover` \| `contain` \| `fill`       |
| `crop({ x, y, width, height })`         | Pixel rectangle                             |
| `grayscale()`, `invert()`, `blur(n)`    | Simple filters                              |
| `rotate(deg)`                           | 90 / 180 / 270                              |
| `toFormat('webp' \| 'png' \| 'jpeg', opts)` | Encoder options vary per format         |
| `toBuffer()` / `toUint8Array()`         | Finalize the pipeline                       |

Each call returns the pipeline so you can chain or branch. The WASM module is loaded lazily on first use.

## Why not Sharp?

Sharp depends on libvips and a per-architecture native binary. That hurts in serverless contexts and CI matrices. Photon is pure WASM — single artifact, runs anywhere `WebAssembly` does — at the cost of slower pixel throughput. For thumbnailing and small-image transforms the difference is irrelevant; for batch ETL on huge images, prefer Sharp.
