/**
 * Tests for CLI auth prompts (auth-prompts.ts)
 *
 * Mocks the local @/cli/clack re-export instead of the global @clack/prompts
 * package to avoid Bun's process-wide mock bleed (oven-sh/bun#12823).
 */

import { afterEach, beforeEach, describe, expect, mock, test, vi } from 'bun:test';

// Mock the local clack re-export (NOT @clack/prompts directly — that bleeds)
const mockIntro = vi.fn();
const mockText = vi.fn();
const mockSelect = vi.fn();
const mockMultiselect = vi.fn();
const mockPassword = vi.fn();
const mockConfirm = vi.fn();
const mockCancel = vi.fn();
const mockIsCancel = vi.fn().mockReturnValue(false);
const mockGroup = vi.fn();

mock.module('@/cli/clack', () => ({
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

import {
  promptAddUser,
  promptCreateToken,
  promptDeleteUser,
  promptEditUser,
  promptEmail,
  promptSelectScopes,
  promptSelectUser,
  showError,
  showSuccess,
  validators,
} from '@/cli/auth-prompts';

/**
 * Helper: make mockGroup call each callback (like real p.group does)
 * so the inner prompt configs actually execute for coverage.
 */
function setupGroupCallbacks() {
  mockGroup.mockImplementation(async (prompts: Record<string, () => Promise<unknown>>) => {
    const results: Record<string, unknown> = {};
    for (const [key, fn] of Object.entries(prompts)) {
      results[key] = await fn();
    }
    return results;
  });
}

describe('cli/auth-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    process.exit = mockExit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  // ---------- validators ----------

  describe('validators.email', () => {
    test('returns undefined for valid email', () => {
      expect(validators.email('user@test.com')).toBeUndefined();
    });

    test('returns error string for invalid email', () => {
      expect(validators.email('bad')).toBeString();
    });
  });

  describe('validators.name', () => {
    test('returns undefined for valid name', () => {
      expect(validators.name('John')).toBeUndefined();
    });

    test('returns error string for short name', () => {
      expect(validators.name('')).toBeString();
    });
  });

  describe('validators.password', () => {
    test('returns undefined for valid password', () => {
      expect(validators.password('Strong1!')).toBeUndefined();
    });

    test('returns error string for weak password', () => {
      expect(validators.password('short')).toBeString();
    });
  });

  // ---------- promptAddUser ----------

  describe('promptAddUser', () => {
    test('returns user data with lowercased email', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('USER@TEST.COM'); // email
      mockText.mockResolvedValueOnce('Test User'); // name
      mockSelect.mockResolvedValueOnce('admin'); // role
      mockPassword.mockResolvedValueOnce('Pass123!'); // password

      const result = await promptAddUser();

      expect(mockIntro).toHaveBeenCalled();
      expect(mockGroup).toHaveBeenCalled();
      expect(result.email).toBe('user@test.com');
      expect(result.name).toBe('Test User');
      expect(result.role).toBe('admin');
      expect(result.password).toBe('Pass123!');
    });

    test('calls each prompt with correct options', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('a@b.com');
      mockText.mockResolvedValueOnce('A');
      mockSelect.mockResolvedValueOnce('user');
      mockPassword.mockResolvedValueOnce('x');

      await promptAddUser();

      // Email prompt
      expect(mockText.mock.calls[0][0].message).toBe('Email address');
      expect(mockText.mock.calls[0][0].validate).toBe(validators.email);
      // Name prompt
      expect(mockText.mock.calls[1][0].message).toBe('Display name');
      expect(mockText.mock.calls[1][0].validate).toBe(validators.name);
      // Role prompt
      expect(mockSelect.mock.calls[0][0].options).toHaveLength(4);
      // Password prompt
      expect(mockPassword.mock.calls[0][0].validate).toBe(validators.password);
    });

    test('onCancel calls p.cancel and process.exit', async () => {
      mockGroup.mockImplementation(async (_prompts: unknown, opts: Record<string, () => void>) => {
        opts.onCancel();
        return {
          email: '',
          name: '',
          role: '',
          password: '',
        };
      });

      try {
        await promptAddUser();
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- promptSelectUser ----------

  describe('promptSelectUser', () => {
    const users = [
      {
        id: 'u1',
        email: 'a@test.com',
        name: 'Alice',
        role: 'admin',
      },
      {
        id: 'u2',
        email: 'b@test.com',
        name: 'Bob',
        role: 'user',
      },
    ];

    test('returns selected user ID', async () => {
      mockSelect.mockResolvedValue('u1');

      const result = await promptSelectUser(users);

      expect(result).toBe('u1');
      expect(mockSelect).toHaveBeenCalled();
    });

    test('passes user options to select prompt', async () => {
      mockSelect.mockResolvedValue('u2');

      await promptSelectUser(users);

      const opts = mockSelect.mock.calls[0][0];
      expect(opts.options).toHaveLength(2);
      expect(opts.options[0].value).toBe('u1');
      expect(opts.options[0].label).toBe('a@test.com');
      expect(opts.options[1].value).toBe('u2');
    });

    test('calls cancel and exits when user cancels', async () => {
      const cancelSymbol = Symbol('cancel');
      mockSelect.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockReturnValue(true);

      try {
        await promptSelectUser(users);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- promptEditUser ----------

  describe('promptEditUser', () => {
    const user = {
      name: 'Alice',
      role: 'admin',
      isActive: true,
    };

    test('returns name and role changes', async () => {
      mockMultiselect.mockResolvedValue(['name', 'role']);
      mockText.mockResolvedValue('New Name');
      mockSelect.mockResolvedValue('user');

      const result = await promptEditUser(user);

      expect(result.name).toBe('New Name');
      expect(result.role).toBe('user');
      expect(result.isActive).toBeUndefined();
      expect(result.resetPassword).toBeUndefined();
    });

    test('returns active status change', async () => {
      mockMultiselect.mockResolvedValue(['active']);
      mockConfirm.mockResolvedValue(false);

      const result = await promptEditUser(user);

      expect(result.isActive).toBe(false);
    });

    test('returns password reset', async () => {
      mockMultiselect.mockResolvedValue(['password']);
      mockPassword.mockResolvedValue('NewPass1!');

      const result = await promptEditUser(user);

      expect(result.resetPassword).toBe('NewPass1!');
    });

    test('returns all changes when all selected', async () => {
      mockMultiselect.mockResolvedValue(['name', 'role', 'active', 'password']);
      mockText.mockResolvedValue('New Name');
      mockSelect.mockResolvedValue('guest');
      mockConfirm.mockResolvedValue(true);
      mockPassword.mockResolvedValue('NewPass1!');

      const result = await promptEditUser(user);

      expect(result.name).toBe('New Name');
      expect(result.role).toBe('guest');
      expect(result.isActive).toBe(true);
      expect(result.resetPassword).toBe('NewPass1!');
    });

    test('returns empty object when no actions selected', async () => {
      mockMultiselect.mockResolvedValue([]);

      const result = await promptEditUser(user);

      expect(result).toEqual({});
    });

    test('cancelling multiselect calls cancel and exits', async () => {
      const cancelSymbol = Symbol('cancel');
      mockMultiselect.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockImplementation((v) => v === cancelSymbol);

      try {
        await promptEditUser(user);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('cancelling name prompt calls cancel and exits', async () => {
      const cancelSymbol = Symbol('cancel');
      mockMultiselect.mockResolvedValue(['name']);
      mockText.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockImplementation((v) => v === cancelSymbol);

      try {
        await promptEditUser(user);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('cancelling role prompt calls cancel and exits', async () => {
      const cancelSymbol = Symbol('cancel');
      mockMultiselect.mockResolvedValue(['role']);
      mockSelect.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockImplementation((v) => v === cancelSymbol);

      try {
        await promptEditUser(user);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('cancelling active prompt calls cancel and exits', async () => {
      const cancelSymbol = Symbol('cancel');
      mockMultiselect.mockResolvedValue(['active']);
      mockConfirm.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockImplementation((v) => v === cancelSymbol);

      try {
        await promptEditUser(user);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('cancelling password prompt calls cancel and exits', async () => {
      const cancelSymbol = Symbol('cancel');
      mockMultiselect.mockResolvedValue(['password']);
      mockPassword.mockResolvedValue(cancelSymbol);
      mockIsCancel.mockImplementation((v) => v === cancelSymbol);

      try {
        await promptEditUser(user);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- promptDeleteUser ----------

  describe('promptDeleteUser', () => {
    test('returns true when user confirms', async () => {
      mockConfirm.mockResolvedValue(true);

      const result = await promptDeleteUser('alice@test.com');

      expect(result).toBe(true);
      expect(mockConfirm).toHaveBeenCalled();
    });

    test('returns false and calls cancel when user declines', async () => {
      mockConfirm.mockResolvedValue(false);

      const result = await promptDeleteUser('alice@test.com');

      expect(result).toBe(false);
      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  // ---------- promptEmail ----------

  describe('promptEmail', () => {
    test('returns lowercased email', async () => {
      mockText.mockResolvedValue('USER@TEST.COM');

      const result = await promptEmail();

      expect(result).toBe('user@test.com');
    });

    test('passes custom message to prompt', async () => {
      mockText.mockResolvedValue('test@test.com');

      await promptEmail('Enter your email');

      const opts = mockText.mock.calls[0][0];
      expect(opts.message).toBe('Enter your email');
    });

    test('uses default message when none provided', async () => {
      mockText.mockResolvedValue('test@test.com');

      await promptEmail();

      const opts = mockText.mock.calls[0][0];
      expect(opts.message).toBe('Email address');
    });
  });

  // ---------- promptSelectScopes ----------

  describe('promptSelectScopes', () => {
    const scopes = [
      {
        value: 'read',
        label: 'Read',
      },
      {
        value: 'write',
        label: 'Write',
      },
    ];

    test('returns selected scopes', async () => {
      mockMultiselect.mockResolvedValue(['read', 'write']);

      const result = await promptSelectScopes(scopes);

      expect(result).toEqual(['read', 'write']);
    });

    test('calls cancel and exits when selection is empty', async () => {
      mockMultiselect.mockResolvedValue([]);

      try {
        await promptSelectScopes(scopes);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('No scopes selected');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('calls cancel and exits when selection is falsy', async () => {
      mockMultiselect.mockResolvedValue(null);

      try {
        await promptSelectScopes(scopes);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('No scopes selected');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- promptCreateToken ----------

  describe('promptCreateToken', () => {
    const scopes = [
      {
        value: 'read',
        label: 'Read',
      },
      {
        value: 'write',
        label: 'Write',
      },
    ];

    test('returns token creation data', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('my-token'); // name
      mockMultiselect.mockResolvedValueOnce(['read']); // scopes
      mockSelect.mockResolvedValueOnce(2592000); // expiresIn

      const result = await promptCreateToken(scopes);

      expect(mockIntro).toHaveBeenCalled();
      expect(result.name).toBe('my-token');
      expect(result.scopes).toEqual(['read']);
      expect(result.expiresIn).toBe(2592000);
    });

    test('calls each prompt with correct options', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('token');
      mockMultiselect.mockResolvedValueOnce(['read']);
      mockSelect.mockResolvedValueOnce(0);

      await promptCreateToken(scopes);

      // Token name prompt
      expect(mockText.mock.calls[0][0].message).toBe('Token name');
      // Scope selector uses availableScopes
      expect(mockMultiselect.mock.calls[0][0].options).toEqual(scopes);
      // Expiration selector
      expect(mockSelect.mock.calls[0][0].options).toHaveLength(5);
    });

    test('converts expiresIn to number', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('token');
      mockMultiselect.mockResolvedValueOnce(['read']);
      mockSelect.mockResolvedValueOnce('3600');

      const result = await promptCreateToken(scopes);

      expect(result.expiresIn).toBe(3600);
    });

    test('name validator rejects empty', async () => {
      setupGroupCallbacks();
      mockText.mockResolvedValueOnce('token');
      mockMultiselect.mockResolvedValueOnce(['read']);
      mockSelect.mockResolvedValueOnce(0);

      await promptCreateToken(scopes);

      const validate = mockText.mock.calls[0][0].validate;
      expect(validate('')).toBe('Token name is required');
      expect(validate('ok')).toBeUndefined();
    });

    test('onCancel calls p.cancel and process.exit', async () => {
      mockGroup.mockImplementation(async (_prompts: unknown, opts: Record<string, () => void>) => {
        opts.onCancel();
        return {
          name: '',
          scopes: [],
          expiresIn: 0,
        };
      });

      try {
        await promptCreateToken(scopes);
      } catch (e) {
        expect(e).toBeInstanceOf(ExitError);
      }

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- showSuccess ----------

  describe('showSuccess', () => {
    test('logs formatted success message', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      showSuccess('Created!', {
        Email: 'a@b.com',
        Role: 'admin',
      });

      expect(logSpy).toHaveBeenCalled();
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Created!');
      expect(allOutput).toContain('a@b.com');
      expect(allOutput).toContain('admin');

      logSpy.mockRestore();
    });

    test('capitalizes keys in output', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      showSuccess('Done', {
        email: 'x@y.com',
      });

      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Email:');

      logSpy.mockRestore();
    });
  });

  // ---------- showError ----------

  describe('showError', () => {
    test('logs formatted error message', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      showError('Something went wrong');

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0][0];
      expect(output).toContain('Something went wrong');

      logSpy.mockRestore();
    });
  });
});
