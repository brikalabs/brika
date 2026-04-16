/**
 * Tests for CLI auth user commands (user-list, user-add, user-edit, user-delete)
 *
 * Mocks @/cli/commands/auth/prompts (re-export layer) instead of @clack/prompts
 * to avoid Bun's process-wide mock.module() bleed (oven-sh/bun#12823).
 */

import { afterEach, beforeEach, describe, expect, mock, test, vi } from 'bun:test';
import { container } from '@brika/di';

// ── Mock all external dependencies BEFORE imports ──

const mockStop = vi.fn();
const mockBootstrapCLI = vi.fn().mockResolvedValue({
  stop: mockStop,
});
const mockPrintDatabaseInfo = vi.fn();
mock.module('@/cli/commands/auth/bootstrap', () => ({
  bootstrapCLI: mockBootstrapCLI,
  printDatabaseInfo: mockPrintDatabaseInfo,
}));

// Mock auth-server re-export layer (never mock @brika/auth/server directly)
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
mock.module('@/cli/commands/auth/auth-server', () => ({
  auth: vi.fn().mockReturnValue({}),
  UserService: MockUserService,
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
const mockPromptAddUser = vi.fn();
const mockPromptSelectUser = vi.fn();
const mockPromptEditUser = vi.fn();
const mockPromptDeleteUser = vi.fn();
const mockPromptEmail = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockValidators = {
  email: vi.fn(),
};
mock.module('@/cli/commands/auth/prompts', () => ({
  promptAddUser: mockPromptAddUser,
  promptSelectUser: mockPromptSelectUser,
  promptEditUser: mockPromptEditUser,
  promptDeleteUser: mockPromptDeleteUser,
  promptEmail: mockPromptEmail,
  showSuccess: mockShowSuccess,
  showError: mockShowError,
  validators: mockValidators,
}));

// Register mock UserService in the real DI container so inject(UserService) works
container.registerInstance(MockUserService, mockUserService);

import userAddCmd from '@/cli/commands/auth/user-add';
import userDeleteCmd from '@/cli/commands/auth/user-delete';
import userEditCmd from '@/cli/commands/auth/user-edit';
// Import commands AFTER all mocks are set up
import userListCmd from '@/cli/commands/auth/user-list';

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
    mockUserService.listUsers.mockReturnValue([
      {
        id: 'u1',
        email: 'alice@test.com',
        name: 'Alice',
        role: 'admin',
      },
      {
        id: 'u2',
        email: 'bob@test.com',
        name: 'Bob',
        role: 'user',
      },
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
    mockUserService.listUsers.mockReturnValue([]);

    await userListCmd.handler(handlerArgs);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No users found');
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('always calls cli.stop() in finally', async () => {
    mockUserService.listUsers.mockReturnValue([]);

    await userListCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('calls cli.stop() even when listUsers throws', async () => {
    mockUserService.listUsers.mockImplementation(() => {
      throw new Error('DB error');
    });

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
    mockUserService.createUser.mockReturnValue({
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
    mockUserService.createUser.mockReturnValue({
      id: 'u1',
      email: 'new@test.com',
      name: 'New User',
      role: 'admin',
    });
    mockUserService.setPassword.mockResolvedValue(undefined);

    await userAddCmd.handler(handlerArgs);

    expect(mockShowSuccess).toHaveBeenCalledWith(
      'User created!',
      expect.objectContaining({
        Email: 'new@test.com',
        Name: 'New User',
      })
    );
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();
  });

  test('catches UNIQUE constraint error and shows "User already exists"', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'existing@test.com',
      name: 'Dup',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: users.email');
    });

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
    mockUserService.createUser.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

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
    mockUserService.createUser.mockImplementation(() => {
      throw 'string-error';
    });

    await expect(userAddCmd.handler(handlerArgs)).rejects.toBe('string-error');
  });

  test('always calls cli.stop()', async () => {
    mockPromptAddUser.mockResolvedValue({
      email: 'new@test.com',
      name: 'New',
      role: 'user',
      password: 'Pass123!',
    });
    mockUserService.createUser.mockReturnValue({
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
    mockUserService.createUser.mockImplementation(() => {
      throw new Error('fail');
    });

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
    mockUserService.listUsers.mockReturnValue([]);

    await userEditCmd.handler(handlerArgs);

    expect(mockShowError).toHaveBeenCalledWith('No users found');
  });

  test('shows error when selected user not found in list', async () => {
    mockUserService.listUsers.mockReturnValue([
      {
        id: 'u1',
        email: 'a@test.com',
        name: 'Alice',
        role: 'admin',
        isActive: true,
      },
    ]);
    mockPromptSelectUser.mockResolvedValue('nonexistent-id');

    await userEditCmd.handler(handlerArgs);

    expect(mockShowError).toHaveBeenCalledWith('User not found');
  });

  test('applies name and role changes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = {
      id: 'u1',
      email: 'a@test.com',
      name: 'Alice',
      role: 'admin',
      isActive: true,
    };
    mockUserService.listUsers.mockReturnValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({
      name: 'Alicia',
      role: 'user',
    });
    mockUserService.updateUser.mockReturnValue({
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
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'User updated!',
      expect.objectContaining({
        Email: 'a@test.com',
        Name: 'Alicia',
      })
    );
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('applies password reset alongside other changes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = {
      id: 'u1',
      email: 'a@test.com',
      name: 'Alice',
      role: 'admin',
      isActive: true,
    };
    mockUserService.listUsers.mockReturnValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({
      name: 'Alicia',
      resetPassword: 'NewPass1!',
    });
    mockUserService.updateUser.mockReturnValue({
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
    const user = {
      id: 'u1',
      email: 'a@test.com',
      name: 'Alice',
      role: 'admin',
      isActive: true,
    };
    mockUserService.listUsers.mockReturnValue([user]);
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
    const user = {
      id: 'u1',
      email: 'a@test.com',
      name: 'Alice',
      role: 'admin',
      isActive: true,
    };
    mockUserService.listUsers.mockReturnValue([user]);
    mockPromptSelectUser.mockResolvedValue('u1');
    mockPromptEditUser.mockResolvedValue({
      isActive: false,
    });
    mockUserService.updateUser.mockReturnValue({
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
    mockUserService.listUsers.mockReturnValue([]);

    await userEditCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('catches CliError and shows error', async () => {
    mockUserService.listUsers.mockImplementation(() => {
      throw new MockCliError('Permission denied');
    });

    try {
      await userEditCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('Permission denied');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('catches generic Error and shows error', async () => {
    mockUserService.listUsers.mockImplementation(() => {
      throw new Error('DB crashed');
    });

    try {
      await userEditCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('DB crashed');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('rethrows non-Error values', async () => {
    mockUserService.listUsers.mockImplementation(() => {
      throw 42;
    });

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
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockReturnValue(undefined);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockPromptEmail).toHaveBeenCalledWith('User email address');
    expect(mockPromptDeleteUser).toHaveBeenCalledWith('alice@test.com');
    expect(mockUserService.deleteUser).toHaveBeenCalledWith('alice@test.com');
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User deleted successfully');
    expect(mockPrintDatabaseInfo).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('returns early when user declines confirmation', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(false);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockUserService.deleteUser).not.toHaveBeenCalled();
    expect(mockBootstrapCLI).not.toHaveBeenCalled();
  });

  test('handles "not found" error from deleteUser', async () => {
    mockPromptEmail.mockResolvedValue('nobody@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockImplementation(() => {
      throw new Error('User not found in database');
    });

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('User not found');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles generic Error', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('DB connection lost');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles CliError', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockImplementation(() => {
      throw new MockCliError('CLI problem');
    });

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockShowError).toHaveBeenCalledWith('CLI problem');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('rethrows non-Error values', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockImplementation(() => {
      throw 'string-err';
    });

    await expect(userDeleteCmd.handler(handlerArgs)).rejects.toBe('string-err');
  });

  test('always calls cli.stop() after bootstrap', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockReturnValue(undefined);

    await userDeleteCmd.handler(handlerArgs);

    expect(mockStop).toHaveBeenCalled();
  });

  test('calls cli.stop() even on error after bootstrap', async () => {
    mockPromptEmail.mockResolvedValue('alice@test.com');
    mockPromptDeleteUser.mockResolvedValue(true);
    mockUserService.deleteUser.mockImplementation(() => {
      throw new Error('fail');
    });

    try {
      await userDeleteCmd.handler(handlerArgs);
    } catch (e) {
      expect(e).toBeInstanceOf(ExitError);
    }

    expect(mockStop).toHaveBeenCalled();
  });
});
