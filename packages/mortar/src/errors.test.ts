import { describe, expect, test } from 'bun:test';
import {
  CommandParseError,
  ConfigError,
  DuplicateServiceIdError,
  HealthCheckTimeoutError,
  MissingToolError,
  MortarError,
} from './errors';

describe('MortarError hierarchy', () => {
  test('ConfigError is instanceof MortarError and has correct name', () => {
    const err = new ConfigError('services.hub.health.port', 'must be a port');
    expect(err).toBeInstanceOf(MortarError);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.name).toBe('ConfigError');
    expect(err.path).toBe('services.hub.health.port');
    expect(err.message).toBe('services.hub.health.port: must be a port');
  });

  test('CommandParseError is instanceof MortarError and has correct name', () => {
    const err = new CommandParseError('bad command');
    expect(err).toBeInstanceOf(MortarError);
    expect(err).toBeInstanceOf(CommandParseError);
    expect(err.name).toBe('CommandParseError');
    expect(err.message).toBe('bad command');
  });

  test('DuplicateServiceIdError stores id and formats message', () => {
    const err = new DuplicateServiceIdError('hub');
    expect(err).toBeInstanceOf(MortarError);
    expect(err.name).toBe('DuplicateServiceIdError');
    expect(err.id).toBe('hub');
    expect(err.message).toBe('duplicate service id "hub"');
  });

  test('HealthCheckTimeoutError (http kind) formats message with cause', () => {
    const cause = new Error('connection refused');
    const err = new HealthCheckTimeoutError('http', 'http://localhost:3000/', 5_000, cause);
    expect(err).toBeInstanceOf(MortarError);
    expect(err.name).toBe('HealthCheckTimeoutError');
    expect(err.kind).toBe('http');
    expect(err.target).toBe('http://localhost:3000/');
    expect(err.timeoutMs).toBe(5_000);
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('http://localhost:3000/');
    expect(err.message).toContain('5000ms');
    expect(err.message).toContain('connection refused');
  });

  test('HealthCheckTimeoutError (tcp kind) formats message with cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new HealthCheckTimeoutError('tcp', 'localhost:3000', 3_000, cause);
    expect(err.kind).toBe('tcp');
    expect(err.message).toContain('localhost:3000');
    expect(err.message).toContain('3000ms');
    expect(err.message).toContain('ECONNREFUSED');
  });

  test('HealthCheckTimeoutError (auto kind) says pid in message', () => {
    const cause = new Error('no ports');
    const err = new HealthCheckTimeoutError('auto', '12345', 10_000, cause);
    expect(err.kind).toBe('auto');
    // auto uses "pid <target>" in the subject
    expect(err.message).toContain('pid 12345');
  });

  test('HealthCheckTimeoutError with non-Error cause omits error detail in tail', () => {
    const err = new HealthCheckTimeoutError('http', 'http://x/', 1_000, null);
    // no " :" suffix from cause when cause is not an Error
    expect(err.message).not.toMatch(/: \S/);
    expect(err.cause).toBeNull();
  });

  test('MissingToolError stores tool name and formats message', () => {
    const err = new MissingToolError('lsof');
    expect(err).toBeInstanceOf(MortarError);
    expect(err.name).toBe('MissingToolError');
    expect(err.tool).toBe('lsof');
    expect(err.message).toContain('lsof');
    expect(err.message).toContain('health: auto');
  });

  test('MissingToolError for pgrep', () => {
    const err = new MissingToolError('pgrep');
    expect(err.tool).toBe('pgrep');
    expect(err.message).toContain('pgrep');
  });
});
