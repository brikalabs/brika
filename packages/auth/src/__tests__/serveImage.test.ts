/**
 * @brika/auth - serveImage Tests
 *
 * Tests for the image serving utility: null data handling, cache headers,
 * ETag generation, 304 responses, and query parameter parsing with photon resize.
 */

import { describe, expect, it } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { type ImageQuery, serveImage } from '../server/serveImage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCtx(
  query: ImageQuery = {},
  headers: Record<string, string> = {}
): {
  req: Request;
  query: ImageQuery;
} {
  const req = new Request('http://localhost:3001/api/auth/avatar/user-1', {
    headers,
  });
  return {
    req,
    query,
  };
}

/** Simple 1x1 white PNG as a Buffer for testing. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
    'Nl7BcQAAAABJRU5ErkJggg==',
  'base64'
);

/** Create a valid NxN RGB PNG for resize tests. */
function makeTestPng(size: number): Buffer {
  function crc32(buf: Buffer): number {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ (table[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([
      Buffer.from(type),
      data,
    ]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([
      len,
      td,
      crc,
    ]);
  }
  const rowBytes = 1 + size * 3; // filter byte + RGB per pixel
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter=none
    for (let x = 0; x < size; x++) {
      raw[y * rowBytes + 1 + x * 3] = 255; // R
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serveImage', () => {
  // -------------------------------------------------------------------------
  // null data
  // -------------------------------------------------------------------------

  describe('null data', () => {
    it('should return 204 when data is null', () => {
      const response = serveImage(null, createCtx());
      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Basic response
  // -------------------------------------------------------------------------

  describe('basic response', () => {
    it('should return webp content type', () => {
      const response = serveImage(TINY_IMAGE, createCtx());
      expect(response.headers.get('Content-Type')).toBe('image/webp');
    });

    it('should return 200 status', () => {
      const response = serveImage(TINY_IMAGE, createCtx());
      expect(response.status).toBe(200);
    });

    it('should include ETag header', () => {
      const response = serveImage(TINY_IMAGE, createCtx());
      const etag = response.headers.get('ETag');
      expect(etag).not.toBeNull();
      expect(etag).toStartWith('"');
      expect(etag).toEndWith('"');
    });

    it('should return body as Uint8Array', async () => {
      const response = serveImage(TINY_IMAGE, createCtx());
      const body = await response.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);
    });

    it('should produce consistent ETag for same data', () => {
      const r1 = serveImage(TINY_IMAGE, createCtx());
      const r2 = serveImage(TINY_IMAGE, createCtx());
      expect(r1.headers.get('ETag')).toBe(r2.headers.get('ETag'));
    });

    it('should produce different ETag for different data', () => {
      const otherImage = Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x00,
      ]);
      const r1 = serveImage(TINY_IMAGE, createCtx());
      const r2 = serveImage(otherImage, createCtx());
      expect(r1.headers.get('ETag')).not.toBe(r2.headers.get('ETag'));
    });
  });

  // -------------------------------------------------------------------------
  // 304 Not Modified
  // -------------------------------------------------------------------------

  describe('304 Not Modified', () => {
    it('should return 304 when If-None-Match matches ETag', () => {
      const firstResponse = serveImage(TINY_IMAGE, createCtx());
      const etag = firstResponse.headers.get('ETag');
      if (!etag) {
        throw new Error('Expected ETag header to be defined');
      }

      const ctx = createCtx(
        {},
        {
          'If-None-Match': etag,
        }
      );
      const response = serveImage(TINY_IMAGE, ctx);

      expect(response.status).toBe(304);
      expect(response.headers.get('ETag')).toBe(etag);
    });

    it('should return 200 when If-None-Match does not match', () => {
      const ctx = createCtx(
        {},
        {
          'If-None-Match': '"stale-etag"',
        }
      );
      const response = serveImage(TINY_IMAGE, ctx);
      expect(response.status).toBe(200);
    });

    it('should return 304 with null body', () => {
      const firstResponse = serveImage(TINY_IMAGE, createCtx());
      const etag = firstResponse.headers.get('ETag');
      if (!etag) {
        throw new Error('Expected ETag header to be defined');
      }

      const ctx = createCtx(
        {},
        {
          'If-None-Match': etag,
        }
      );
      const response = serveImage(TINY_IMAGE, ctx);
      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Cache-Control
  // -------------------------------------------------------------------------

  describe('Cache-Control', () => {
    it('should default to 1-year max-age with immutable', () => {
      const response = serveImage(TINY_IMAGE, createCtx());
      const cc = response.headers.get('Cache-Control');
      expect(cc).toBe('public, max-age=31536000, immutable');
    });

    it('should use custom maxAge with immutable', () => {
      const response = serveImage(TINY_IMAGE, createCtx(), {
        maxAge: 7200,
      });
      const cc = response.headers.get('Cache-Control');
      expect(cc).toBe('public, max-age=7200, immutable');
    });

    it('should use no-cache when maxAge is 0', () => {
      const response = serveImage(TINY_IMAGE, createCtx(), {
        maxAge: 0,
      });
      const cc = response.headers.get('Cache-Control');
      expect(cc).toBe('no-cache');
    });
  });

  // -------------------------------------------------------------------------
  // Query parameters (w, h, s) — resize via @cf-wasm/photon
  // -------------------------------------------------------------------------

  describe('query parameters', () => {
    it('should handle empty query', () => {
      const response = serveImage(TINY_IMAGE, createCtx({}));
      expect(response.status).toBe(200);
    });

    it('should resize with ?s (square)', () => {
      const validImage = makeTestPng(4);
      const response = serveImage(
        validImage,
        createCtx({
          s: 2,
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/webp');
    });

    it('should resize with ?w only', () => {
      const validImage = makeTestPng(4);
      const response = serveImage(
        validImage,
        createCtx({
          w: 3,
        })
      );
      expect(response.status).toBe(200);
    });

    it('should resize with ?w and ?h', () => {
      const validImage = makeTestPng(4);
      const response = serveImage(
        validImage,
        createCtx({
          w: 3,
          h: 2,
        })
      );
      expect(response.status).toBe(200);
    });

    it('should skip resize when no dimensions provided', () => {
      const response = serveImage(TINY_IMAGE, createCtx({}));
      expect(response.status).toBe(200);
    });
  });
});
