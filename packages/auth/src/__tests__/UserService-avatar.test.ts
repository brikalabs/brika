/**
 * @brika/auth - UserService Avatar & deleteUser Tests
 *
 * Tests for avatar-related methods (processAvatar, setAvatar, getAvatarData,
 * removeAvatar) and deleteUser. These complement the existing UserService.test.ts
 * which covers createUser, getUser, getUserByEmail, listUsers, setPassword,
 * verifyPassword, and hasAdmin.
 */

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { processAvatar, UserService } from '../services/UserService';
import { openAuthDatabase } from '../setup';
import { Role } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a valid W×H RGB PNG buffer for testing. */
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
  ihdr[9] = 2; // colour type: RGB

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
    ]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// processAvatar (exported pure function)
// ---------------------------------------------------------------------------

describe('processAvatar', () => {
  it('should return a Buffer', () => {
    const input = makeTestPng(16);
    const result = processAvatar(input);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should produce a non-empty output', () => {
    const input = makeTestPng(16);
    const result = processAvatar(input);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('should produce WebP output (RIFF....WEBP magic bytes)', () => {
    const input = makeTestPng(16);
    const result = processAvatar(input);
    // WebP files start with RIFF
    expect(result[0]).toBe(0x52); // R
    expect(result[1]).toBe(0x49); // I
    expect(result[2]).toBe(0x46); // F
    expect(result[3]).toBe(0x46); // F
    // Bytes 8-11 are "WEBP"
    expect(result[8]).toBe(0x57); // W
    expect(result[9]).toBe(0x45); // E
    expect(result[10]).toBe(0x42); // B
    expect(result[11]).toBe(0x50); // P
  });

  it('should produce consistent output for the same input', () => {
    const input = makeTestPng(16);
    const r1 = processAvatar(input);
    const r2 = processAvatar(input);
    expect(Buffer.compare(r1, r2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UserService — avatar methods + deleteUser
// ---------------------------------------------------------------------------

describe('UserService — avatar & deleteUser', () => {
  let db: Database;
  let service: UserService;

  beforeEach(() => {
    db = openAuthDatabase(':memory:');
    service = new UserService(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // setAvatar
  // -------------------------------------------------------------------------

  describe('setAvatar', () => {
    it('should return a hash string', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      const hash = service.setAvatar(user.id, makeTestPng(16));
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should return a short alphanumeric hash (base-36, max 8 chars)', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      const hash = service.setAvatar(user.id, makeTestPng(16));
      expect(hash).toMatch(/^[0-9a-z]{1,8}$/);
    });

    it('should produce the same hash for the same image', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      const input = makeTestPng(16);
      const h1 = service.setAvatar(user.id, input);
      const h2 = service.setAvatar(user.id, input);
      expect(h1).toBe(h2);
    });
  });

  // -------------------------------------------------------------------------
  // getAvatarData
  // -------------------------------------------------------------------------

  describe('getAvatarData', () => {
    it('should retrieve avatar data after setAvatar', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      service.setAvatar(user.id, makeTestPng(16));

      const result = service.getAvatarData(user.id);
      expect(result).not.toBeNull();
      // bun:sqlite returns BLOB columns as Uint8Array (Buffer is a Uint8Array subclass)
      expect(result?.data).toBeInstanceOf(Uint8Array);
      expect(result?.data.byteLength).toBeGreaterThan(0);
    });

    it('should return image/webp mimeType after setAvatar', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      service.setAvatar(user.id, makeTestPng(16));

      const result = service.getAvatarData(user.id);
      expect(result?.mimeType).toBe('image/webp');
    });

    it('should return null for user without avatar', () => {
      const user = service.createUser('noavatar@example.com', 'No Avatar', Role.USER);
      const result = service.getAvatarData(user.id);
      expect(result).toBeNull();
    });

    it('should return null for non-existent user id', () => {
      const result = service.getAvatarData('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // removeAvatar
  // -------------------------------------------------------------------------

  describe('removeAvatar', () => {
    it('should clear avatar so getAvatarData returns null', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      service.setAvatar(user.id, makeTestPng(16));

      // Confirm avatar was set
      expect(service.getAvatarData(user.id)).not.toBeNull();

      service.removeAvatar(user.id);

      expect(service.getAvatarData(user.id)).toBeNull();
    });

    it('should be a no-op for user without avatar', () => {
      const user = service.createUser('noavatar@example.com', 'No Avatar', Role.USER);
      // Should not throw even if no avatar is present
      expect(service.removeAvatar(user.id)).toBeUndefined();
      expect(service.getAvatarData(user.id)).toBeNull();
    });

    it('should clear avatarHash on user after removeAvatar', () => {
      const user = service.createUser('avatar@example.com', 'Avatar User', Role.USER);
      service.setAvatar(user.id, makeTestPng(16));

      const before = service.getUser(user.id);
      expect(before?.avatarHash).not.toBeNull();

      service.removeAvatar(user.id);

      const after = service.getUser(user.id);
      expect(after?.avatarHash).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteUser
  // -------------------------------------------------------------------------

  describe('deleteUser', () => {
    it('should delete an existing non-admin user', () => {
      service.createUser('todelete@example.com', 'To Delete', Role.USER);

      service.deleteUser('todelete@example.com');

      const gone = service.getUserByEmail('todelete@example.com');
      expect(gone).toBeNull();
    });

    it('should throw for a non-existent user', () => {
      expect(() => service.deleteUser('ghost@example.com')).toThrow('User not found');
    });

    it('should throw when trying to delete an admin user', () => {
      service.createUser('admin@example.com', 'Admin', Role.ADMIN);

      expect(() => service.deleteUser('admin@example.com')).toThrow('Cannot delete admin user');

      // User must still exist after the failed attempt
      const still = service.getUserByEmail('admin@example.com');
      expect(still).not.toBeNull();
    });

    it('should be case-insensitive for email lookup', () => {
      service.createUser('mixed@example.com', 'Mixed Case', Role.USER);

      service.deleteUser('MIXED@EXAMPLE.COM');

      const gone = service.getUserByEmail('mixed@example.com');
      expect(gone).toBeNull();
    });

    it('should delete GUEST and SERVICE roles as well', () => {
      service.createUser('guest@example.com', 'Guest User', Role.GUEST);
      service.createUser('svc@example.com', 'Service Account', Role.SERVICE);

      service.deleteUser('guest@example.com');
      service.deleteUser('svc@example.com');

      expect(service.getUserByEmail('guest@example.com')).toBeNull();
      expect(service.getUserByEmail('svc@example.com')).toBeNull();
    });
  });
});
