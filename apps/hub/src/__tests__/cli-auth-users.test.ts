/**
 * Tests for CLI auth user commands (user-list, user-add, user-edit, user-delete)
 *
 * Uses mock.module() to intercept external dependencies.
 * IMPORTANT: Does NOT mock @brika/di or @brika/router — those bleed process-wide
 * (Bun bug #12823) and break all subsequent test files.
 */

import { describe, test, expect, vi, mock, beforeEach, afterEach } from 'bun:test';
import { container } from '@brika/di';

// ── Mock all external dependencies BEFORE imports ──

const mockStop = vi.fn();
const mockBootstrapCLI = vi.fn().mockResolvedValue({ stop: mockStop });
const mockPrintDatabaseInfo = vi.fn();
mock.module('@/cli/bootstrap', () => ({
  bootstrapCLI: mockBootstrapCLI,
  printDatabaseInfo: mockPrintDatabaseInfo,
}));

// Mock the runtime util so dataDir doesn't cause side effects
mock.module('@/cli/utils/runtime', () => ({
  dataDir: '/tmp/test-brika',
}));

// Mock @brika/auth/server — define the token class outside so we can register it in the DI container
const mockUserService = {
  listUsers: vi.fn(),
  createUser: vi.fn(),
  setPassword: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  verifyPassword: vi.fn(),
};
class MockUserService {}
mock.module('@brika/auth/server', () => ({
  auth: vi.fn().mockReturnValue({}),
  UserService: MockUserService,
}));

// NOTE: @brika/auth is NOT mocked — it only exports pure schemas/types with no side effects.
// Mocking it with mock.module() would bleed process-wide (Bun bug #12823).

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

// Mock auth-prompts
const mockPromptAddUser = vi.fn();
const mockPromptSelectUser = vi.fn();
const mockPromptEditUser = vi.fn();
const mockPromptDeleteUser = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockValidators = { email: vi.fn() };
mock.module('@/cli/auth-prompts', () => ({
  promptAddUser: mockPromptAddUser,
  promptSelectUser: mockPromptSelectUser,
  promptEditUser: mockPromptEditUser,
  promptDeleteUser: mockPromptDeleteUser,
  showSuccess: mockShowSuccess,
  showError: mockShowError,
  validators: mockValidators,
}));

// Mock @clack/prompts (include all prompt types to avoid bleed into other test files)
const mockIntro = vi.fn();
const mockText = vi.fn();
const mockConfirm = vi.fn();
const mockCancel = vi.fn();
const mockSelect = vi.fn();
const mockMultiselect = vi.fn();
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

// Mock picocolors — pass through strings
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
  },
}));

// Register mock UserService in the real DI container so inject(UserService) works
container.registerInstance(MockUserService, mockUserService);

// Import commands AFTER all mocks are set up
import userListCmd from '@/cli/commands/auth/user-list';
import userAddCmd from '@/cli/commands/auth/user-add';
import userEditCmd from '@/cli/commands/auth/user-edit';
import userDeleteCmd from '@/cli/commands/auth/user-delete';

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

describe('cli/commands/auth/user-list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test('lists users with formatted output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUserService.listUsers.mockResolvedValue([
      { id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'admin' },
      { id: 'u2', email: 'bob@test.com', name: 'Bob', role: 'user' },
    ]);

    await userListCmd.handler(handlerArgs);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('alice@test.com');
    expect(output).toContain('bob@test.com');
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('shows "No users found" for empty list', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUserService.listUsers.mockResolvedValue([]);

    await userListCmd.handler(handlerArgs);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No users found');
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('always calls cli.stop() in finally', async () => {
    mockUserService.listUsers.mockResolvedValue([]);

    await userListCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('calls cli.stop() even when listUsers throws', async () => {
    mockUserService.listUsers.mockRejectedValue(new Error('DB error'));

    try {
      await userListCmd.handler(handlerArgs);
    } catch {
      // Expected to throw
    }

    expect(mockStop).toHaveBeenCalled();
  });
});

describe('cli/commands/auth/user-add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test('creates user and sets password from prompt answers', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New User',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockResolvedValue({
      id: 'u1',
      email: 'new@test.com',
      name: 'New User',
      role: 'user',
    });
    mockUserService.setPassword.mockResolvedValue(undefined);

    await userAddCmd.handler(handlerArgs);

    expect(mockUserService.createUser).toHaveBeenCalledWith('new@test.com', 'New User', 'user');
    expect(mockUserService.setPassword).toHaveBeenCalledWith('u1', 'Pass123!');
  });

  test('shows success message after creating user', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New User',
      role: 'admin',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockResolvedValue({
      id: 'u1',
      email: 'new@test.com',
      name: 'New User',
      role: 'admin',
    });
    mockUserService.setPassword.mockResolvedValue(undefined);

    await userAddCmd.handler(handlerArgs);

    expect(mockShowSuccess).toHaveBeenCalledWith('User created!', expect.objectContaining({
      Email: 'new@test.com',
      Name: 'New User',
    }));
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();
  });

  test('catches UNIQUE constraint error and shows "User already exists"', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'existing@test.com',
      name: 'Dup',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockRejectedValue(
      new Error('UNIQUE constraint failed: users.email')
    );

    try {
      await userAddCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('User already exists');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('shows generic error message for other errors', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockRejectedValue(new Error('DB connection failed'));

    try {
      await userAddCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('DB connection failed');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('rethrows non-Error values', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockRejectedValue('string-error');

    await expect(userAddCmd.handler(handlerArgs)).rejects.toBe('string-error');
  });

  test('always calls cli.stop()', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockResolvedValue({
      id: 'u1',
      email: 'new@test.com',
      name: 'New',
      role: 'user',
    });
    mockUserService.setPassword.mockResolvedValue(undefined);

    await userAddCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('calls cli.stop() even on error', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'x@y.com',
      name: 'X',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockRejectedValue(new Error('fail'));

    try {
      await userAddCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockStop).toHaveBeenCalled();
  });
});

describe('cli/commands/auth/user-edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test('shows error when no users found', async () => {
    mockUserService.listUsers.mockResolvedValue([]);

    await userEditCmd.handler(handlerArgs);

    expect(mockShowError).toHaveBeenCalledWith('No users found');
  });

  test('shows error when selected user not found in list', async () => {
    mockUserService.listUsers.mockResolvedValue([
      { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', isActive: true },
    ]);
    mockPromptSelectUser.mockResolvedValue('nonexistent-id');

    await userEditCmd.handler(handlerArgs);

    expect(mockShowError).toHaveBeenCalledWith('User not found');
  });

  test('applies name and role changes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', isActive: true };
    mockUserService.listUsers.mockResolvedValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({ name: 'Alicia', role: 'user' });
    mockUserService.updateUser.mockResolvedValue({
      ...user,
      name: 'Alicia',
      role: 'user',
    });

    await userEditCmd.handler(handlerArgs);

    expect(mockUserService.updateUser).toHaveBeenCalledWith('u1', {
      name: 'Alicia',
      role: 'user',
      isActive: undefined,
    });
    expect(mockShowSuccess).toHaveBeenCalledWith('User updated!', expect.objectContaining({
      Email: 'a@test.com',
      Name: 'Alicia',
    }));
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('applies password reset alongside other changes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', isActive: true };
    mockUserService.listUsers.mockResolvedValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({ name: 'Alicia', resetPassword: 'NewPass1!' });
    mockUserService.updateUser.mockResolvedValue({
      ...user,
      name: 'Alicia',
    });
    mockUserService.setPassword.mockResolvedValue(undefined);

    await userEditCmd.handler(handlerArgs);

    expect(mockUserService.setPassword).toHaveBeenCalledWith('u1', 'NewPass1!');
    // Success message should include Password: reset indicator
    expect(mockShowSuccess).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('shows "No changes made" when nothing selected', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', isActive: true };
    mockUserService.listUsers.mockResolvedValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({});

    await userEditCmd.handler(handlerArgs);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No changes made');
    expect(mockUserService.updateUser).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('applies isActive change', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', isActive: true };
    mockUserService.listUsers.mockResolvedValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({ isActive: false });
    mockUserService.updateUser.mockResolvedValue({
      ...user,
      isActive: false,
    });

    await userEditCmd.handler(handlerArgs);

    expect(mockUserService.updateUser).toHaveBeenCalledWith('u1', {
      name: undefined,
      role: undefined,
      isActive: false,
    });

    logSpy.mockRestore();
  });

  test('always calls cli.stop()', async () => {
    mockUserService.listUsers.mockResolvedValue([]);

    await userEditCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('catches CliError and shows error', async () => {
    mockUserService.listUsers.mockRejectedValue(new MockCliError('Permission denied'));

    try {
      await userEditCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('Permission denied');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('catches generic Error and shows error', async () => {
    mockUserService.listUsers.mockRejectedValue(new Error('DB crashed'));

    try {
      await userEditCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('DB crashed');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('rethrows non-Error values', async () => {
    mockUserService.listUsers.mockRejectedValue(42);

    await expect(userEditCmd.handler(handlerArgs)).rejects.toBe(42);
  });
});

describe('cli/commands/auth/user-delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test('prompts for email and confirmation, then deletes user', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockResolvedValue(undefined);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockText).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockUserService.deleteUser).toHaveBeenCalledWith('alice@test.com');
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User deleted successfully');
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('returns early when user declines confirmation', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(false);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
    expect(mockUserService.deleteUser).not.toHaveBeenCalled();
    expect(mockBootstrapCLI).not.toHaveBeenCalled();
  });

  test('handles "not found" error from deleteUser', async () => {
    mockText.mockResolvedValue('nobody@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockRejectedValue(new Error('User not found in database'));

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('User not found');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles generic Error', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockRejectedValue(new Error('DB connection lost'));

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('DB connection lost');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles CliError', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockRejectedValue(new MockCliError('CLI problem'));

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('CLI problem');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('rethrows non-Error values', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockRejectedValue('string-err');

    await expect(userDeleteCmd.handler(handlerArgs)).rejects.toBe('string-err');
  });

  test('always calls cli.stop() after bootstrap', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockResolvedValue(undefined);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('calls cli.stop() even on error after bootstrap', async () => {
    mockText.mockResolvedValue('alice@test.com');
    mockConfirm.mockResolvedValue(true);
    mockUserService.deleteUser.mockRejectedValue(new Error('fail'));

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockStop).toHaveBeenCalled();
  });
});
