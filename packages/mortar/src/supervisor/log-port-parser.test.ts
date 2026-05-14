import { describe, expect, test } from 'bun:test';
import { parsePortFromLog } from './log-port-parser';

describe('parsePortFromLog', () => {
  describe('http(s) URL patterns', () => {
    test.each([
      ['Local:   http://localhost:5173/', 5173],
      ['  ➜  Network: http://192.168.1.10:5173/', 5173],
      ['Listening on https://localhost:3001', 3001],
      ['Server running at http://127.0.0.1:8080/', 8080],
      ['→ http://0.0.0.0:4000', 4000],
    ])('finds port in URL: %s → %i', (line, port) => {
      expect(parsePortFromLog(line)).toBe(port);
    });

    test('matches IPv6 bracketed host', () => {
      expect(parsePortFromLog('listening at http://[::1]:5174/')).toBe(5174);
    });
  });

  describe('listening / running keyword patterns', () => {
    test.each([
      ['listening on port 3000', 3000],
      ['listening on 5173', 5173],
      ['Listen port: 8787', 8787],
      ['bound on port=3001', 3001],
      ['ready on :4000', 4000],
      ['server: 8080', 8080],
    ])('finds port: %s → %i', (line, port) => {
      expect(parsePortFromLog(line)).toBe(port);
    });
  });

  describe('port=KV pattern', () => {
    test.each([
      ['Using port 5173', 5173],
      ['port: 8080', 8080],
      ['PORT=3000', 3000],
    ])('extracts port: %s → %i', (line, port) => {
      expect(parsePortFromLog(line)).toBe(port);
    });
  });

  describe('ANSI stripping', () => {
    test('removes ANSI escape sequences before matching', () => {
      const ansi = `\x1b[32mLocal:\x1b[0m \x1b[36mhttp://localhost:5173/\x1b[0m`;
      expect(parsePortFromLog(ansi)).toBe(5173);
    });
  });

  describe('rejection cases', () => {
    test.each([
      'no port in this line',
      'compiled in 1234ms',
      'request #5678 took 100ms',
      '',
      '2026-05-14T12:34:56Z',
    ])('returns null for: %s', (line) => {
      expect(parsePortFromLog(line)).toBeNull();
    });

    test('rejects out-of-range numbers', () => {
      expect(parsePortFromLog('port: 70000')).toBeNull();
      expect(parsePortFromLog('http://x:0/')).toBeNull();
    });
  });

  describe('first match wins (regex order)', () => {
    test('URL is preferred over generic port=KV', () => {
      expect(parsePortFromLog('using port 1234 — open http://localhost:5173/')).toBe(5173);
    });
  });
});
