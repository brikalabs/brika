import { computeResize } from './resize';
import type { ImageInfo, JpegOptions, OutputFormat, ResizeFit, ResizeOptions } from './types';
import { processImage, readMetadata } from './wasm';

/**
 * Fluent image processing pipeline.
 *
 * Methods record configuration without executing. `.toBuffer()` runs the full
 * pipeline with automatic WASM memory cleanup.
 *
 * @example
 * ```ts
 * photon(imageBytes)
 *   .resize(256, 256, { fit: 'cover' })
 *   .webp()
 *   .toBuffer();
 * ```
 */
export class PhotonPipeline {
  private readonly input: Uint8Array;
  private resizeOpt: {
    width?: number;
    height?: number;
    fit: ResizeFit;
  } | null = null;
  private outputFormat: OutputFormat = {
    format: 'webp',
  };

  constructor(input: Uint8Array | Buffer) {
    this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
  }

  /** Resize to specific dimensions. */
  resize(
    width: number,
    height: number,
    options?: {
      fit?: ResizeFit;
    }
  ): this;
  resize(options: ResizeOptions): this;
  resize(
    widthOrOptions: number | ResizeOptions,
    height?: number,
    options?: {
      fit?: ResizeFit;
    }
  ): this {
    if (typeof widthOrOptions === 'number') {
      this.resizeOpt = {
        width: widthOrOptions,
        height,
        fit: options?.fit ?? 'contain',
      };
    } else {
      const { width, height, fit } = widthOrOptions;
      this.resizeOpt = {
        width,
        height,
        fit: fit ?? 'contain',
      };
    }
    return this;
  }

  /** Output as WebP (default). */
  webp(): this {
    this.outputFormat = {
      format: 'webp',
    };
    return this;
  }

  /** Output as JPEG. */
  jpeg(options?: JpegOptions): this {
    this.outputFormat = {
      format: 'jpeg',
      quality: options?.quality ?? 80,
    };
    return this;
  }

  /** Output as PNG. */
  png(): this {
    this.outputFormat = {
      format: 'png',
    };
    return this;
  }

  /** Execute the pipeline and return the processed image. */
  toBuffer(): Buffer {
    const { width, height } = readMetadata(this.input);
    const op = this.resizeOpt
      ? computeResize(
          width,
          height,
          this.resizeOpt.width,
          this.resizeOpt.height,
          this.resizeOpt.fit
        )
      : null;
    return processImage(this.input, op, this.outputFormat);
  }

  /** Get image dimensions without processing. */
  metadata(): ImageInfo {
    return readMetadata(this.input);
  }
}

/** Create an image processing pipeline from raw image bytes. */
export function photon(input: Uint8Array | Buffer): PhotonPipeline {
  return new PhotonPipeline(input);
}
