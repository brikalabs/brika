import { describe, expect, test } from 'bun:test';
import { bytesToDataUrl, dataUrlToBytes, normalizeMedia, sniffMimeType } from './media';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('normalizeMedia', () => {
  test('http url string', () => {
    expect(normalizeMedia('https://x.test/a.png')).toEqual({ url: 'https://x.test/a.png' });
  });

  test('raw bytes with mime sniffing', () => {
    const media = normalizeMedia(PNG);
    expect(media?.bytes).toEqual(PNG);
    expect(media?.mimeType).toBe('image/png');
  });

  test('base64 data url decodes to bytes', () => {
    const dataUrl = bytesToDataUrl(PNG, 'image/png');
    const media = normalizeMedia(dataUrl);
    expect(media?.bytes).toEqual(PNG);
    expect(media?.mimeType).toBe('image/png');
  });

  test('envelope with url and mimeType', () => {
    expect(normalizeMedia({ url: 'https://x.test/v.mp4', mimeType: 'video/mp4' })).toEqual({
      url: 'https://x.test/v.mp4',
      mimeType: 'video/mp4',
    });
  });

  test('JSON-degraded Uint8Array (index-keyed object) is revived', () => {
    const degraded = JSON.parse(JSON.stringify(PNG));
    const media = normalizeMedia(degraded);
    expect(media?.bytes).toEqual(PNG);
    expect(media?.mimeType).toBe('image/png');
  });

  test('non-media values return null', () => {
    expect(normalizeMedia(42)).toBeNull();
    expect(normalizeMedia('plain text')).toBeNull();
    expect(normalizeMedia({ foo: 'bar' })).toBeNull();
    expect(normalizeMedia(null)).toBeNull();
  });
});

describe('data url round-trip', () => {
  test('bytes -> data url -> bytes', () => {
    const url = bytesToDataUrl(PNG);
    expect(url.startsWith('data:image/png;base64,')).toBeTrue();
    expect(dataUrlToBytes(url)?.bytes).toEqual(PNG);
  });

  test('sniffMimeType recognizes jpeg and mp4', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMimeType(jpeg)).toBe('image/jpeg');
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffMimeType(mp4)).toBe('video/mp4');
  });
});
