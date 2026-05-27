/**
 * Lock down the new `Locked` (423) HTTP exception and the `Conflict`
 * data carrier. The router serialises `data` into the JSON body, so
 * a regression here would break the update flow's 409/423 contract.
 */

import { describe, expect, test } from 'bun:test';
import { Conflict, Locked } from './exceptions';

describe('Locked (423)', () => {
  test('has 423 status', () => {
    expect(new Locked().status).toBe(423);
  });

  test('default message identifies the condition', () => {
    expect(new Locked().message).toBe('Locked');
  });

  test('forwards custom message + data to the body', () => {
    const e = new Locked('Update in progress', { since: '2026-05-27T00:00:00Z' });
    expect(e.message).toBe('Update in progress');
    expect(e.data).toEqual({ since: '2026-05-27T00:00:00Z' });
  });

  test('name pins instanceof matching', () => {
    expect(new Locked().name).toBe('Locked');
  });
});

describe('Conflict (409) — data passthrough', () => {
  test('accepts structured data', () => {
    const e = new Conflict('Update refused', {
      code: 'UPDATE_DEV_MODE',
      guidance: 'Stop the dev server.',
    });
    expect(e.status).toBe(409);
    expect(e.data).toEqual({
      code: 'UPDATE_DEV_MODE',
      guidance: 'Stop the dev server.',
    });
  });
});
