/**
 * UpdateAuditLog tests.
 *
 * Verifies the JSONL append, rotation behavior, and "never throws into
 * the caller" contract.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateAuditLog } from './audit-log';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-audit-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('UpdateAuditLog', () => {
  test('append writes one JSONL line per event', () => {
    const log = new UpdateAuditLog(tmp);
    log.append('apply.start', { mode: 'standalone' });
    log.append('apply.success', { to: '0.6.0' });

    const lines = readFileSync(log.path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const [first, second] = lines.map((l) => JSON.parse(l));
    expect(first.kind).toBe('apply.start');
    expect(first.data.mode).toBe('standalone');
    expect(typeof first.ts).toBe('string');
    expect(second.kind).toBe('apply.success');
    expect(second.data.to).toBe('0.6.0');
  });

  test('rotates when the log exceeds 1 MB', () => {
    const log = new UpdateAuditLog(tmp);
    // Pre-seed the file with > 1 MB so the next append triggers rotation.
    writeFileSync(log.path, 'x'.repeat(1024 * 1024 + 1));
    log.append('apply.start');

    const rotated = `${log.path}.1`;
    expect(existsSync(rotated)).toBe(true);
    // New file is a single fresh JSONL entry.
    const lines = readFileSync(log.path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}').kind).toBe('apply.start');
  });

  test('does not rotate while under the size threshold', () => {
    const log = new UpdateAuditLog(tmp);
    log.append('apply.start');
    log.append('apply.success');
    expect(existsSync(`${log.path}.1`)).toBe(false);
    const size = statSync(log.path).size;
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1024);
  });

  test('append never throws even if the target directory is read-only', () => {
    // Simulate a broken backing dir by pointing at a non-writable path.
    const log = new UpdateAuditLog('/dev/null/audit-bogus-path');
    // Must not throw — audit logging is best-effort.
    expect(() => log.append('apply.start')).not.toThrow();
  });
});
