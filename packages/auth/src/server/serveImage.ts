/**
 * @brika/auth/server - serveImage
 *
 * Serve binary image data as a Response with resize, cache, and ETag support.
 *
 * Query params (validated via ImageQuerySchema in the route):
 * - `?s=128`       → square resize (128×128 cover crop)
 * - `?w=200&h=100` → explicit width/height (cover crop)
 * - `?w=200`       → resize width, keep aspect ratio
 * - `?h=100`       → resize height, keep aspect ratio
 *
 * All output as webp. Cache-Control + ETag for caching. 304 on match.
 */

import { photon } from '@brika/photon';
import { z } from 'zod';

const MAX_PX = 2048;
const dim = z.coerce.number().int().min(1).max(MAX_PX).optional();

export const ImageQuerySchema = z.object({
  w: dim,
  h: dim,
  s: dim,
});

export type ImageQuery = z.infer<typeof ImageQuerySchema>;

interface ServeImageOptions {
  maxAge?: number;
  immutable?: boolean;
}

export function serveImage(
  data: Buffer | null,
  ctx: {
    req: Request;
    query: ImageQuery;
  },
  options?: ServeImageOptions
): Response {
  if (!data) {
    return new Response(null, {
      status: 204,
    });
  }

  const maxAge = options?.maxAge ?? 31536000;
  const { s, w, h } = ctx.query ?? {};
  const width = s ?? w;
  const height = s ?? h;

  let output: Buffer = data;
  if (width ?? height) {
    const fit = width && height ? 'cover' : 'contain';
    output = photon(data)
      .resize({
        width,
        height,
        fit,
      })
      .webp()
      .toBuffer();
  }

  const etag = `"${Bun.hash(output).toString(36)}"`;

  if (ctx.req.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
      },
    });
  }

  const useImmutable = options?.immutable ?? maxAge > 0;
  let cacheControl = 'no-cache';
  if (maxAge > 0) {
    const suffix = useImmutable ? ', immutable' : ', must-revalidate';
    cacheControl = `public, max-age=${maxAge}${suffix}`;
  }

  return new Response(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': cacheControl,
      ETag: etag,
    },
  });
}
