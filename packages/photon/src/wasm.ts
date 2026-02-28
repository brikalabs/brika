/**
 * WASM lifecycle helpers for @cf-wasm/photon.
 *
 * Every PhotonImage allocated inside a scope is tracked and freed automatically
 * when the scope exits — no manual .free() calls or nested try-finally pyramids.
 */

import { PhotonImage, SamplingFilter, crop, resize } from '@cf-wasm/photon';
import type { OutputFormat, ResizeOp } from './types';

/** RAII scope that tracks WASM allocations and frees them on dispose. */
export class WasmScope {
  private readonly images: PhotonImage[] = [];

  /** Decode raw bytes into a tracked PhotonImage. */
  load(input: Uint8Array): PhotonImage {
    const img = PhotonImage.new_from_byteslice(input);
    this.images.push(img);
    return img;
  }

  /** Register a PhotonImage for automatic cleanup. */
  track(img: PhotonImage): PhotonImage {
    this.images.push(img);
    return img;
  }

  /** Free all tracked images in reverse allocation order. */
  dispose(): void {
    for (let i = this.images.length - 1; i >= 0; i--) {
      this.images[i]!.free();
    }
  }
}

/** Run `fn` inside a WASM scope with guaranteed cleanup. */
export function withScope<T>(fn: (scope: WasmScope) => T): T {
  const scope = new WasmScope();
  try {
    return fn(scope);
  } finally {
    scope.dispose();
  }
}

/** Execute a full image pipeline: decode → resize/crop → encode. */
export function processImage(
  input: Uint8Array,
  resizeOp: ResizeOp | null,
  format: OutputFormat,
): Buffer {
  return withScope((scope) => {
    let img = scope.load(input);

    if (resizeOp) {
      img = scope.track(resize(img, resizeOp.width, resizeOp.height, SamplingFilter.Lanczos3));

      if (resizeOp.crop) {
        const { x, y, w, h } = resizeOp.crop;
        img = scope.track(crop(img, x, y, x + w, y + h));
      }
    }

    return encode(img, format);
  });
}

/** Read image dimensions without processing. */
export function readMetadata(input: Uint8Array): { width: number; height: number } {
  return withScope((scope) => {
    const img = scope.load(input);
    return { width: img.get_width(), height: img.get_height() };
  });
}

function encode(img: PhotonImage, format: OutputFormat): Buffer {
  switch (format.format) {
    case 'webp':
      return Buffer.from(img.get_bytes_webp());
    case 'jpeg':
      return Buffer.from(img.get_bytes_jpeg(format.quality));
    case 'png':
      return Buffer.from(img.get_bytes());
  }
}
