/**
 * @brika/auth - AuthService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { container } from '@brika/di';
import { AuthService } from '../services/AuthService';
import { SessionService } from '../services/SessionService';
import { ScopeService } from '../services/ScopeService';
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
    getSessionTTL: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    container.clearInstances();

    mockUserService = {
      createUser: vi.fn(),
      getUser: vi.fn(),
      getUserByEmail: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([]),
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
      getSessionTTL: vi.fn().mockReturnValue(604800),
    };

    container.register(SessionService, { useValue: mockSessionService });
    container.register(ScopeService, { useClass: ScopeService });

    authService = new AuthService(mockUserService as never);
  });

  describe('login', () => {
    it('should login with valid credentials and return session token', async () => {
      mockUserService.getUserByEmail.mockResolvedValueOnce({
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
      mockUserService.getUserByEmail.mockResolvedValueOnce(null);

      expect(authService.login('nonexistent@example.com', 'password')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should reject invalid password', async () => {
      mockUserService.getUserByEmail.mockResolvedValueOnce({
        id: '1',
        email: 'test@example.com',
      });

      mockUserService.verifyPassword.mockResolvedValueOnce(false);

      expect(authService.login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('logout', () => {
    it('should revoke session by ID', async () => {
      await authService.logout('session-123');
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith('session-123');
    });
  });

  describe('getCurrentUser', () => {
    it('should get user by ID', async () => {
      mockUserService.getUser.mockResolvedValueOnce({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: Role.USER,
      });

      const user = await authService.getCurrentUser('1');
      expect(user?.email).toBe('test@example.com');
      expect(mockUserService.getUser).toHaveBeenCalledWith('1');
    });

    it('should return null for unknown user', async () => {
      mockUserService.getUser.mockResolvedValueOnce(null);

      const user = await authService.getCurrentUser('unknown');
      expect(user).toBeNull();
    });
  });
});
