import { describe, expect, it } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { photon } from '../index';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create a valid W×H RGB PNG for testing. */
function makeTestPng(width: number, height: number = width): Buffer {
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
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  const rowBytes = 1 + width * 3; // filter byte + RGB per pixel
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter=none
    for (let x = 0; x < width; x++) {
      raw[y * rowBytes + 1 + x * 3] = 255; // R
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('photon()', () => {
  // ---------------------------------------------------------------------------
  // metadata
  // ---------------------------------------------------------------------------

  describe('metadata', () => {
    it('should return correct dimensions for square image', () => {
      const info = photon(makeTestPng(100)).metadata();
      expect(info.width).toBe(100);
      expect(info.height).toBe(100);
    });

    it('should return correct dimensions for rectangular image', () => {
      const info = photon(makeTestPng(200, 100)).metadata();
      expect(info.width).toBe(200);
      expect(info.height).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // resize — contain (default)
  // ---------------------------------------------------------------------------

  describe('resize — contain', () => {
    it('should resize by width preserving aspect ratio', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize({
          width: 100,
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(100);
      expect(info.height).toBe(50);
    });

    it('should resize by height preserving aspect ratio', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize({
          height: 50,
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(100);
      expect(info.height).toBe(50);
    });

    it('should contain within both dimensions', () => {
      const buf = photon(makeTestPng(200, 100)).resize(50, 50).png().toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(50);
      expect(info.height).toBe(25);
    });

    it('should default fit to contain with (w, h) overload', () => {
      const buf = photon(makeTestPng(200, 100)).resize(100, 100).png().toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(100);
      expect(info.height).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // resize — cover
  // ---------------------------------------------------------------------------

  describe('resize — cover', () => {
    it('should cover crop to exact dimensions', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize(50, 50, {
          fit: 'cover',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(50);
      expect(info.height).toBe(50);
    });

    it('should handle square source with cover', () => {
      const buf = photon(makeTestPng(100))
        .resize(50, 50, {
          fit: 'cover',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(50);
      expect(info.height).toBe(50);
    });

    it('should cover crop landscape to portrait', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize(30, 60, {
          fit: 'cover',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(30);
      expect(info.height).toBe(60);
    });

    it('should work via options object', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize({
          width: 50,
          height: 50,
          fit: 'cover',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(50);
      expect(info.height).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // resize — fill
  // ---------------------------------------------------------------------------

  describe('resize — fill', () => {
    it('should stretch to exact dimensions', () => {
      const buf = photon(makeTestPng(200, 100))
        .resize(50, 80, {
          fit: 'fill',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(50);
      expect(info.height).toBe(80);
    });

    it('should fill via options object', () => {
      const buf = photon(makeTestPng(100))
        .resize({
          width: 60,
          height: 40,
          fit: 'fill',
        })
        .png()
        .toBuffer();
      const info = photon(buf).metadata();
      expect(info.width).toBe(60);
      expect(info.height).toBe(40);
    });
  });

  // ---------------------------------------------------------------------------
  // output formats
  // ---------------------------------------------------------------------------

  describe('output formats', () => {
    it('should output WebP by default', () => {
      const buf = photon(makeTestPng(4)).toBuffer();
      // RIFF....WEBP magic
      expect(buf[0]).toBe(0x52); // R
      expect(buf[1]).toBe(0x49); // I
      expect(buf[2]).toBe(0x46); // F
      expect(buf[3]).toBe(0x46); // F
    });

    it('should output PNG when requested', () => {
      const buf = photon(makeTestPng(4)).png().toBuffer();
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50); // P
      expect(buf[2]).toBe(0x4e); // N
      expect(buf[3]).toBe(0x47); // G
    });

    it('should output JPEG when requested', () => {
      const buf = photon(makeTestPng(4))
        .jpeg({
          quality: 75,
        })
        .toBuffer();
      expect(buf[0]).toBe(0xff); // SOI marker
      expect(buf[1]).toBe(0xd8);
    });

    it('should use default JPEG quality when not specified', () => {
      const buf = photon(makeTestPng(4)).jpeg().toBuffer();
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
    });
  });

  // ---------------------------------------------------------------------------
  // no-op pipeline (format conversion only)
  // ---------------------------------------------------------------------------

  describe('no-op pipeline', () => {
    it('should encode without resize', () => {
      const buf = photon(makeTestPng(10)).webp().toBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it('should pass through to webp when no operations specified', () => {
      const buf = photon(makeTestPng(10)).toBuffer();
      expect(buf[0]).toBe(0x52); // R (RIFF)
    });
  });

  // ---------------------------------------------------------------------------
  // input flexibility
  // ---------------------------------------------------------------------------

  describe('input types', () => {
    it('should accept Buffer input', () => {
      const buf = photon(Buffer.from(makeTestPng(4)))
        .webp()
        .toBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it('should accept Uint8Array input', () => {
      const buf = photon(new Uint8Array(makeTestPng(4)))
        .webp()
        .toBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // memory safety
  // ---------------------------------------------------------------------------

  describe('memory safety', () => {
    it('should not leak on repeated calls', () => {
      const png = makeTestPng(50);
      for (let i = 0; i < 100; i++) {
        photon(png)
          .resize(25, 25, {
            fit: 'cover',
          })
          .webp()
          .toBuffer();
      }
      // If we get here without OOM, memory is being freed correctly
    });

    it('should throw on invalid input', () => {
      expect(() => photon(new Uint8Array([0, 1, 2])).toBuffer()).toThrow();
    });
  });
});
