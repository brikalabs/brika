/**
 * Tests for the SDK `api/secrets.ts` surface — verifies get/set/delete
 * delegate through `getContext()` so a plugin author sees the
 * Bun.secrets-backed value the hub returned over IPC.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockGetSecret = mock((_key: string): Promise<string | null> => Promise.resolve(null));
const mockSetSecret = mock((_key: string, _value: string): Promise<void> => Promise.resolve());
const mockDeleteSecret = mock((_key: string): Promise<boolean> => Promise.resolve(false));

mock.module('./context', () => ({
  getContext: () => ({
    getSecret: mockGetSecret,
    setSecret: mockSetSecret,
    deleteSecret: mockDeleteSecret,
  }),
}));

const { getSecret, setSecret, deleteSecret } = await import('./api/secrets');

describe('secrets API', () => {
  beforeEach(() => {
    mockGetSecret.mockClear();
    mockSetSecret.mockClear();
    mockDeleteSecret.mockClear();
  });

  test('getSecret delegates to context and forwards the key', async () => {
    mockGetSecret.mockImplementationOnce(() => Promise.resolve('the-token'));
    const value = await getSecret('session-token');
    expect(value).toBe('the-token');
    expect(mockGetSecret).toHaveBeenCalledTimes(1);
    expect(mockGetSecret).toHaveBeenCalledWith('session-token');
  });

  test('getSecret returns null when the hub has no value', async () => {
    mockGetSecret.mockImplementationOnce(() => Promise.resolve(null));
    expect(await getSecret('missing')).toBeNull();
  });

  test('setSecret delegates to context and forwards both arguments', async () => {
    await setSecret('session-token', 'abc');
    expect(mockSetSecret).toHaveBeenCalledTimes(1);
    expect(mockSetSecret).toHaveBeenCalledWith('session-token', 'abc');
  });

  test('deleteSecret delegates and returns the hub`s boolean', async () => {
    mockDeleteSecret.mockImplementationOnce(() => Promise.resolve(true));
    expect(await deleteSecret('session-token')).toBe(true);
    expect(mockDeleteSecret).toHaveBeenCalledWith('session-token');
  });
});
