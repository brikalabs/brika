/**
 * Tests for CLI auth token-create command
 *
 * Uses mock.module() to intercept external dependencies.
 * Due to Bun bug #12823 (process-wide module mock bleed), this file must
 * be run individually: `bun test src/__tests__/cli-auth-token.test.ts`
 */

import { describe, test, expect, vi, mock, beforeEach, afterEach } from 'bun:test';

// ── Mock all dependencies BEFORE imports ──

const mockHubFetchOk = vi.fn();
mock.module('@/cli/utils/hub-client', () => ({
  hubFetchOk: mockHubFetchOk,
}));

// Mock CliError
class MockCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
mock.module('@/cli/errors', () => ({
  CliError: MockCliError,
}));

// Mock @clack/prompts (include all prompt types to avoid bleed into other test files)
const mockIntro = vi.fn();
const mockText = vi.fn();
const mockMultiselect = vi.fn();
const mockSelect = vi.fn();
const mockConfirm = vi.fn();
const mockCancel = vi.fn();
const mockPassword = vi.fn();
const mockIsCancel = vi.fn().mockReturnValue(false);
const mockGroup = vi.fn();
mock.module('@clack/prompts', () => ({
  intro: mockIntro,
  text: mockText,
  select: mockSelect,
  multiselect: mockMultiselect,
  password: mockPassword,
  confirm: mockConfirm,
  cancel: mockCancel,
  isCancel: mockIsCancel,
  group: mockGroup,
}));

// Mock auth-prompts
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
mock.module('@/cli/auth-prompts', () => ({
  showSuccess: mockShowSuccess,
  showError: mockShowError,
}));

// Mock picocolors — pass through strings (include all used colors to avoid bleed)
mock.module('picocolors', () => ({
  default: {
    bgCyan: (s: string) => s,
    bgRed: (s: string) => s,
    black: (s: string) => s,
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
  },
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
}) as any;
const originalExit = process.exit;

const handlerArgs = { values: {}, positionals: [], commands: [] };

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

    // Mock prompt responses in order
    mockText
      .mockResolvedValueOnce('alice@test.com') // userEmail
      .mockResolvedValueOnce('my-integration'); // tokenName
    mockMultiselect.mockResolvedValue(['workflow:read', 'workflow:write']);
    mockSelect.mockResolvedValue((30 * 24 * 60 * 60).toString());

    // Mock API response
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
    expect(mockIntro).toHaveBeenCalled();
    expect(mockText).toHaveBeenCalledTimes(2);
    expect(mockMultiselect).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);

    // Verify fetch was called with correct body
    expect(mockHubFetchOk).toHaveBeenCalledWith('/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('permanent-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

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

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

    mockHubFetchOk.mockRejectedValue(new MockCliError('Hub returned 401 — Unauthorized'));

    try {
      await tokenCreateCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('Hub returned 401 — Unauthorized');
    expect(mockExit).toHaveBeenCalledWith(1);

    vi.restoreAllMocks();
  });

  test('handles generic Error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

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
    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

    mockHubFetchOk.mockRejectedValue('string-error');

    await expect(tokenCreateCmd.handler(handlerArgs)).rejects.toBe('string-error');
  });

  test('passes correct scope options to multiselect', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

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

    const multiselectOpts = mockMultiselect.mock.calls[0][0];
    expect(multiselectOpts.options).toHaveLength(7);
    const scopeValues = multiselectOpts.options.map((o: any) => o.value);
    expect(scopeValues).toContain('workflow:read');
    expect(scopeValues).toContain('workflow:write');
    expect(scopeValues).toContain('workflow:execute');
    expect(scopeValues).toContain('plugin:read');
    expect(scopeValues).toContain('plugin:install');
    expect(scopeValues).toContain('user:read');
    expect(scopeValues).toContain('user:write');

    logSpy.mockRestore();
  });

  test('passes correct expiration options to select', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('0');

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

    const selectOpts = mockSelect.mock.calls[0][0];
    expect(selectOpts.options).toHaveLength(5);
    const expirationValues = selectOpts.options.map((o: any) => o.value);
    expect(expirationValues).toContain('0');
    expect(expirationValues).toContain((7 * 24 * 60 * 60).toString());
    expect(expirationValues).toContain((30 * 24 * 60 * 60).toString());
    expect(expirationValues).toContain((90 * 24 * 60 * 60).toString());
    expect(expirationValues).toContain((365 * 24 * 60 * 60).toString());

    logSpy.mockRestore();
  });

  test('parses expiresIn string to integer', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockText
      .mockResolvedValueOnce('alice@test.com')
      .mockResolvedValueOnce('my-token');
    mockMultiselect.mockResolvedValue(['workflow:read']);
    mockSelect.mockResolvedValue('604800'); // 7 days in seconds

    mockHubFetchOk.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        token: {
          id: 'tok_1',
          name: 'my-token',
          token: 'bk_xxx',
          scopes: ['workflow:read'],
          createdAt: '2026-01-01',
          expiresAt: '2026-01-08',
        },
      }),
    });

    await tokenCreateCmd.handler(handlerArgs);

    const fetchBody = JSON.parse(mockHubFetchOk.mock.calls[0][1].body);
    expect(fetchBody.expiresIn).toBe(604800);
    expect(typeof fetchBody.expiresIn).toBe('number');

    logSpy.mockRestore();
  });
});
