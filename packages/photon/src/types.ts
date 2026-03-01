/** How the image should fit into the target dimensions. */
export type ResizeFit =
  | 'cover' // Scale up to fill, then center-crop to exact dimensions
  | 'contain' // Scale down to fit within, preserving aspect ratio
  | 'fill'; // Stretch to exact dimensions (ignores aspect ratio)

export interface ResizeOptions {
  width?: number;
  height?: number;
  /** Default: `'contain'` */
  fit?: ResizeFit;
}

export interface JpegOptions {
  /** 1–100. Default: 80 */
  quality?: number;
}

export interface ImageInfo {
  width: number;
  height: number;
}

export type OutputFormat =
  | {
      format: 'webp';
    }
  | {
      format: 'jpeg';
      quality: number;
    }
  | {
      format: 'png';
    };

/** Computed resize + optional crop to apply on the WASM image. */
export interface ResizeOp {
  width: number;
  height: number;
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}
