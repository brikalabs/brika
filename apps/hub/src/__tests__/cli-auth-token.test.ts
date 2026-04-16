/**
 * Tests for CLI auth token-create command
 *
 * Mocks @/cli/commands/auth/prompts (re-export layer) instead of @clack/prompts
 * to avoid Bun's process-wide mock.module() bleed (oven-sh/bun#12823).
 */

import { afterEach, beforeEach, describe, expect, mock, test, vi } from 'bun:test';

// ── Mock all dependencies BEFORE imports ──

const mockHubFetchOk = vi.fn();
mock.module('@/cli/commands/auth/hub-client', () => ({
  hubFetchOk: mockHubFetchOk,
}));

// Mock CliError
class MockCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
mock.module('@/cli/commands/auth/errors', () => ({
  CliError: MockCliError,
}));

// Mock prompt helpers (re-export layer only, never mock @/cli/clack directly)
const mockPromptEmail = vi.fn();
const mockPromptCreateToken = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
mock.module('@/cli/commands/auth/prompts', () => ({
  promptEmail: mockPromptEmail,
  promptCreateToken: mockPromptCreateToken,
  showSuccess: mockShowSuccess,
  showError: mockShowError,
}));

// Import command AFTER mocks are set up
import tokenCreateCmd from '@/cli/commands/auth/token-create';

// Sentinel error thrown when process.exit is called
class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}
const mockExit = vi.fn().mockImplementation((code: number) => {
  throw new ExitError(code);
}) as unknown as typeof process.exit;
const originalExit = process.exit;

const handlerArgs = {
  values: {},
  positionals: [],
  commands: [],
};

describe('cli/commands/auth/token-create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test('has correct command metadata', () => {
    expect(tokenCreateCmd.name).toBe('create');
    expect(tokenCreateCmd.description).toBe('Create an API token for a user');
  });

  test('successfully creates token with all prompts', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'my-integration',
      scopes: ['workflow:read', 'workflow:write'],
      expiresIn: 30 * 24 * 60 * 60,
    });

    const tokenResponse = {
      token: {
        id: 'tok_123',
        name: 'my-integration',
        token: 'bk_secret_abc123',
        scopes: ['workflow:read', 'workflow:write'],
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-01-31T00:00:00Z',
      },
    };
    mockHubFetchOk.mockResolvedValue({
      json: vi.fn().mockResolvedValue(tokenResponse),
    });

    await tokenCreateCmd.handler(handlerArgs);

    // Verify prompts were called
    expect(mockPromptEmail).toHaveBeenCalledWith('User email address');
    expect(mockPromptCreateToken).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ value: 'workflow:read' }),
        expect.objectContaining({ value: 'user:write' }),
      ])
    );

    // Verify fetch was called with correct body
    expect(mockHubFetchOk).toHaveBeenCalledWith('/api/auth/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userEmail: 'alice@test.com',
        name: 'my-integration',
        scopes: ['workflow:read', 'workflow:write'],
        expiresIn: 30 * 24 * 60 * 60,
      }),
    });

    // Verify success display
    expect(mockShowSuccess).toHaveBeenCalledWith('API token created successfully!', {
      ID: 'tok_123',
      Name: 'my-integration',
      Scopes: 'workflow:read, workflow:write',
      Expires: '2026-01-31T00:00:00Z',
    });

    // Verify token value is displayed
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('bk_secret_abc123');

    logSpy.mockRestore();
  });

  test('shows "Never" for tokens without expiration', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'permanent-token',
      scopes: ['workflow:read'],
      expiresIn: 0,
    });

    const tokenResponse = {
      token: {
        id: 'tok_456',
        name: 'permanent-token',
        token: 'bk_secret_xyz',
        scopes: ['workflow:read'],
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: null,
      },
    };
    mockHubFetchOk.mockResolvedValue({
      json: vi.fn().mockResolvedValue(tokenResponse),
    });

    await tokenCreateCmd.handler(handlerArgs);

    expect(mockShowSuccess).toHaveBeenCalledWith('API token created successfully!', {
      ID: 'tok_456',
      Name: 'permanent-token',
      Scopes: 'workflow:read',
      Expires: 'Never',
    });

    logSpy.mockRestore();
  });

  test('handles CliError from hubFetchOk', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'my-token',
      scopes: ['workflow:read'],
      expiresIn: 0,
    });

    mockHubFetchOk.mockRejectedValue(new MockCliError('Hub returned 401'));

    try {
      await tokenCreateCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('Hub returned 401');
    expect(mockExit).toHaveBeenCalledWith(1);

    vi.restoreAllMocks();
  });

  test('handles generic Error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'my-token',
      scopes: ['workflow:read'],
      expiresIn: 0,
    });

    mockHubFetchOk.mockRejectedValue(new Error('Network error'));

    try {
      await tokenCreateCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('Network error');
    expect(mockExit).toHaveBeenCalledWith(1);

    vi.restoreAllMocks();
  });

  test('rethrows non-Error values', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'my-token',
      scopes: ['workflow:read'],
      expiresIn: 0,
    });

    mockHubFetchOk.mockRejectedValue('string-error');

    await expect(tokenCreateCmd.handler(handlerArgs)).rejects.toBe('string-error');
  });

  test('passes all 7 scope options to promptCreateToken', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptCreateToken.mockResolvedValue({
      name: 'my-token',
      scopes: ['workflow:read'],
      expiresIn: 0,
    });

    mockHubFetchOk.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        token: {
          id: 'tok_1',
          name: 'my-token',
          token: 'bk_xxx',
          scopes: ['workflow:read'],
          createdAt: '2026-01-01',
          expiresAt: null,
        },
      }),
    });

    await tokenCreateCmd.handler(handlerArgs);

    const scopeArg = mockPromptCreateToken.mock.calls[0][0];
    expect(scopeArg).toHaveLength(7);
    const scopeValues = scopeArg.map((o: Record<string, unknown>) => o.value);
    expect(scopeValues).toContain('workflow:read');
    expect(scopeValues).toContain('workflow:write');
    expect(scopeValues).toContain('workflow:execute');
    expect(scopeValues).toContain('plugin:read');
    expect(scopeValues).toContain('plugin:install');
    expect(scopeValues).toContain('user:read');
    expect(scopeValues).toContain('user:write');

    logSpy.mockRestore();
  });
});
