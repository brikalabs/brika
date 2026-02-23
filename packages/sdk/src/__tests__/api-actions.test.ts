/**
 * Tests for SDK actions API
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockRegisterAction = mock(() => {});

mock.module('../context', () => ({
  getContext: () => ({
    registerAction: mockRegisterAction,
  }),
}));

const { defineAction } = await import('../api/actions');

describe('defineAction', () => {
  beforeEach(() => {
    mockRegisterAction.mockClear();
  });

  test('returns ActionRef with __actionId', () => {
    const handler = async () => ({ ok: true });
    const ref = defineAction(handler);

    expect(ref.__actionId).toBeDefined();
    expect(typeof ref.__actionId).toBe('string');
    expect(ref.__actionId.length).toBeGreaterThan(0);
  });

  test('registers action with context', () => {
    const handler = async () => 'result';
    defineAction(handler);

    expect(mockRegisterAction).toHaveBeenCalledTimes(1);
    const [id, registeredHandler] = mockRegisterAction.mock.calls[0] as [string, Function];
    expect(typeof id).toBe('string');
    expect(typeof registeredHandler).toBe('function');
  });

  test('generates unique IDs for sequential actions', () => {
    const ref1 = defineAction(async () => 1);
    const ref2 = defineAction(async () => 2);
    const ref3 = defineAction(async () => 3);

    expect(ref1.__actionId).not.toBe(ref2.__actionId);
    expect(ref2.__actionId).not.toBe(ref3.__actionId);
    expect(ref1.__actionId).not.toBe(ref3.__actionId);
  });

  test('action IDs are base36 encoded', () => {
    const ref = defineAction(async () => null);
    // base36 only contains [0-9a-z]
    expect(ref.__actionId).toMatch(/^[0-9a-z]+$/);
  });
});
