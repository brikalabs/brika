/**
 * Tests for CLI hub-client utilities
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { hubUrl } from '@/cli/utils/hub-client';

describe('cli/utils/hub-client', () => {
  const origPort = process.env.BRIKA_PORT;
  const origHost = process.env.BRIKA_HOST;

  afterEach(() => {
    if (origPort === undefined) delete process.env.BRIKA_PORT;
    else process.env.BRIKA_PORT = origPort;
    if (origHost === undefined) delete process.env.BRIKA_HOST;
    else process.env.BRIKA_HOST = origHost;
  });

  describe('hubUrl', () => {
    test('defaults to http://127.0.0.1:3001', () => {
      delete process.env.BRIKA_PORT;
      delete process.env.BRIKA_HOST;
      expect(hubUrl()).toBe('http://127.0.0.1:3001');
    });

    test('uses explicit port argument', () => {
      delete process.env.BRIKA_PORT;
      delete process.env.BRIKA_HOST;
      expect(hubUrl(8080)).toBe('http://127.0.0.1:8080');
    });

    test('reads port from BRIKA_PORT env', () => {
      process.env.BRIKA_PORT = '9090';
      delete process.env.BRIKA_HOST;
      expect(hubUrl()).toBe('http://127.0.0.1:9090');
    });

    test('explicit port overrides env', () => {
      process.env.BRIKA_PORT = '9090';
      delete process.env.BRIKA_HOST;
      expect(hubUrl(4000)).toBe('http://127.0.0.1:4000');
    });

    test('reads host from BRIKA_HOST env', () => {
      process.env.BRIKA_HOST = '0.0.0.0';
      delete process.env.BRIKA_PORT;
      expect(hubUrl()).toBe('http://0.0.0.0:3001');
    });

    test('combines custom host and port', () => {
      process.env.BRIKA_HOST = '192.168.1.10';
      process.env.BRIKA_PORT = '5000';
      expect(hubUrl()).toBe('http://192.168.1.10:5000');
    });

    test('returns a valid URL (no trailing slash)', () => {
      delete process.env.BRIKA_PORT;
      delete process.env.BRIKA_HOST;
      const url = hubUrl();
      expect(url.endsWith('/')).toBe(false);
      expect(() => new URL(url)).not.toThrow();
    });
  });
});
