/**
 * @brika/auth - AuthService Tests
 */

import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { provide, useTestBed } from '@brika/di/testing';
import { AuthService } from '../services/AuthService';
import { ScopeService } from '../services/ScopeService';
import { SessionService } from '../services/SessionService';
import { UserService } from '../services/UserService';
import { Role, Scope } from '../types';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserService: {
    createUser: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    getUserByEmail: ReturnType<typeof vi.fn>;
    listUsers: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
    setPassword: ReturnType<typeof vi.fn>;
    verifyPassword: ReturnType<typeof vi.fn>;
    hasAdmin: ReturnType<typeof vi.fn>;
  };
  let mockSessionService: {
    createSession: ReturnType<typeof vi.fn>;
    validateSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeAllUserSessions: ReturnType<typeof vi.fn>;
    listUserSessions: ReturnType<typeof vi.fn>;
    cleanExpiredSessions: ReturnType<typeof vi.fn>;
    getSessionTTL: ReturnType<typeof vi.fn>;
  };

  useTestBed(() => {
    mockUserService = {
      createUser: vi.fn(),
      getUser: vi.fn(),
      getUserByEmail: vi.fn(),
      listUsers: vi.fn().mockReturnValue([]),
      deleteUser: vi.fn(),
      setPassword: vi.fn(),
      verifyPassword: vi.fn(),
      hasAdmin: vi.fn(),
    };

    mockSessionService = {
      createSession: vi.fn().mockReturnValue('test-session-token'),
      validateSession: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      listUserSessions: vi.fn().mockReturnValue([]),
      cleanExpiredSessions: vi.fn().mockReturnValue(0),
      getSessionTTL: vi.fn().mockReturnValue(604800),
    };

    provide(SessionService, mockSessionService);
    provide(ScopeService, new ScopeService());
    provide(UserService, mockUserService);

    authService = new AuthService();
  });

  describe('login', () => {
    it('should login with valid credentials and return session token', async () => {
      mockUserService.getUserByEmail.mockReturnValueOnce({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: Role.USER,
        isActive: true,
      });

      mockUserService.verifyPassword.mockResolvedValueOnce(true);

      const result = await authService.login(
        'test@example.com',
        'password123',
        '127.0.0.1',
        'TestAgent'
      );

      expect(result).toBeDefined();
      expect(result.token).toBe('test-session-token');
      expect(result.user.email).toBe('test@example.com');
      expect(result.expiresIn).toBe(604800);
      expect(mockSessionService.createSession).toHaveBeenCalledWith('1', '127.0.0.1', 'TestAgent');
    });

    it('should reject invalid email', async () => {
      mockUserService.getUserByEmail.mockReturnValueOnce(null);

      await expect(authService.login('nonexistent@example.com', 'password')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should reject invalid password', async () => {
      mockUserService.getUserByEmail.mockReturnValueOnce({
        id: '1',
        email: 'test@example.com',
      });

      mockUserService.verifyPassword.mockResolvedValueOnce(false);

      await expect(authService.login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('logout', () => {
    it('should revoke session by ID', () => {
      authService.logout('session-123');
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith('session-123');
    });
  });

  describe('getCurrentUser', () => {
    it('should get user by ID', () => {
      mockUserService.getUser.mockReturnValueOnce({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: Role.USER,
      });

      const user = authService.getCurrentUser('1');
      expect(user?.email).toBe('test@example.com');
      expect(mockUserService.getUser).toHaveBeenCalledWith('1');
    });

    it('should return null for unknown user', () => {
      mockUserService.getUser.mockReturnValueOnce(null);

      const user = authService.getCurrentUser('unknown');
      expect(user).toBeNull();
    });
  });
});
