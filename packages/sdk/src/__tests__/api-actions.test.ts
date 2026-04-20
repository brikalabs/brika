/**
 * Tests for SDK actions API (defineAction runtime behavior)
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockRegisterAction = mock((_id: string, _handler: (...args: unknown[]) => unknown) => {});

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

  // ── Build-injected ID (string first arg) ──────────────────────────────────

  test('accepts build-injected string ID as first argument', () => {
    const handler = async () => ({ ok: true });
    const ref = defineAction('abc123', handler);

    expect(ref.__actionId).toBe('abc123');
  });

  test('registers handler with injected ID', () => {
    const handler = async () => 'result';
    defineAction('my-action-id', handler);

    expect(mockRegisterAction).toHaveBeenCalledTimes(1);
    const call = mockRegisterAction.mock.calls[0];
    if (!call) {
      throw new Error('Expected mock to have been called');
    }
    const [id, registeredHandler] = call;
    expect(id).toBe('my-action-id');
    expect(typeof registeredHandler).toBe('function');
  });

  // ── Deferred: handler without ID (finalized later) ──────────────────────

  test('creates deferred ref when no string ID is provided', () => {
    const ref = defineAction(async function myAction() {
      return 42;
    });

    // Deferred ref has empty ID until __finalizeActions is called
    expect(ref.__actionId).toBe('');
    expect(mockRegisterAction).not.toHaveBeenCalled();
  });

  test('does not throw for anonymous handlers (deferred)', () => {
    expect(() => {
      defineAction(async () => 'no-name');
    }).not.toThrow();
  });

  // ── __finalizeActions ─────────────────────────────────────────────────────

  test('__finalizeActions assigns IDs and registers handlers', async () => {
    const { __finalizeActions } = await import('../api/actions');
    const ref = defineAction(async () => 'result');

    __finalizeActions({ myExport: 'precomputed-id-123' }, { myExport: ref });

    expect(ref.__actionId).toBe('precomputed-id-123');
    expect(mockRegisterAction).toHaveBeenCalledTimes(1);
  });

  test('__finalizeActions skips non-action exports', async () => {
    const { __finalizeActions } = await import('../api/actions');

    __finalizeActions(
      { notAnAction: 'id1', alsoNot: 'id2', nullValue: 'id3' },
      {
        notAnAction: 'just a string',
        alsoNot: 42,
        nullValue: null,
      }
    );

    expect(mockRegisterAction).not.toHaveBeenCalled();
  });

  // ── ActionRef shape ─────────────────────────────────────────────────────────

  test('returns ActionRef with __actionId string', () => {
    const ref = defineAction('test-id', async () => null);
    expect(typeof ref.__actionId).toBe('string');
    expect(ref.__actionId).toBe('test-id');
  });

  test('different IDs produce different refs', () => {
    const ref1 = defineAction('id-1', async () => 1);
    const ref2 = defineAction('id-2', async () => 2);
    const ref3 = defineAction('id-3', async () => 3);

    expect(ref1.__actionId).not.toBe(ref2.__actionId);
    expect(ref2.__actionId).not.toBe(ref3.__actionId);
    expect(ref1.__actionId).not.toBe(ref3.__actionId);
  });
});
