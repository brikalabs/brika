/**
 * @brika/auth - UserService Tests
 */

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { UserService } from '../services/UserService';
import { openAuthDatabase } from '../setup';
import { Role } from '../types';

describe('UserService', () => {
  let service: UserService;
  let db: Database;

  beforeEach(() => {
    db = openAuthDatabase(':memory:');
    service = new UserService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('createUser', () => {
    it('should create a new user', () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe(Role.USER);
      expect(user.isActive).toBe(true);
    });

    it('should lowercase email', () => {
      const user = service.createUser('TEST@EXAMPLE.COM', 'Test User', Role.USER);

      expect(user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', () => {
      service.createUser('test@example.com', 'User 1', Role.USER);

      try {
        service.createUser('test@example.com', 'User 2', Role.USER);
        expect.unreachable('Should throw error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('UNIQUE constraint failed');
      }
    });

    it('should generate unique IDs', () => {
      const user1 = service.createUser('user1@example.com', 'User 1', Role.USER);
      const user2 = service.createUser('user2@example.com', 'User 2', Role.USER);

      expect(user1.id).not.toBe(user2.id);
    });
  });

  describe('getUser', () => {
    it('should retrieve user by ID', () => {
      const created = service.createUser('test@example.com', 'Test User', Role.USER);

      const retrieved = service.getUser(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.email).toBe('test@example.com');
    });

    it('should return null for unknown user', () => {
      const user = service.getUser('unknown-id');
      expect(user).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should retrieve user by email', () => {
      service.createUser('test@example.com', 'Test User', Role.USER);

      const user = service.getUserByEmail('test@example.com');
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    it('should be case-insensitive', () => {
      service.createUser('test@example.com', 'Test User', Role.USER);

      const user = service.getUserByEmail('TEST@EXAMPLE.COM');
      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null for unknown email', () => {
      const user = service.getUserByEmail('unknown@example.com');
      expect(user).toBeNull();
    });
  });

  describe('listUsers', () => {
    it('should list all users', () => {
      service.createUser('user1@example.com', 'User 1', Role.USER);
      service.createUser('user2@example.com', 'User 2', Role.ADMIN);
      service.createUser('user3@example.com', 'User 3', Role.GUEST);

      const users = service.listUsers();
      expect(users).toHaveLength(3);
    });

    it('should return empty array initially', () => {
      const users = service.listUsers();
      expect(users).toEqual([]);
    });
  });

  describe('setPassword', () => {
    it('should set password for user', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      await service.setPassword(user.id, 'Password123!');

      const valid = await service.verifyPassword(user.id, 'Password123!');
      expect(valid).toBe(true);
    });

    it('should reject password too short', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      try {
        await service.setPassword(user.id, 'short');
        expect.unreachable('Should throw error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Min 8 characters');
      }
    });

    it('should require uppercase', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      try {
        await service.setPassword(user.id, 'password123!');
        expect.unreachable('Should throw error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('uppercase letter');
      }
    });

    it('should require number', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      try {
        await service.setPassword(user.id, 'Password!!!!');
        expect.unreachable('Should throw error');
      } catch (error: unknown) {
        expect((error as Error).message).toBeTruthy();
      }
    });

    it('should require special character', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      try {
        await service.setPassword(user.id, 'Password12345');
        expect.unreachable('Should throw error');
      } catch (error: unknown) {
        expect((error as Error).message).toBeTruthy();
      }
    });

    it('should hash password and verify it', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      await service.setPassword(user.id, 'Password123!');

      const valid = await service.verifyPassword(user.id, 'Password123!');
      expect(valid).toBe(true);

      const invalid = await service.verifyPassword(user.id, 'WrongPassword1!');
      expect(invalid).toBe(false);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      await service.setPassword(user.id, 'Password123!');

      const valid = await service.verifyPassword(user.id, 'Password123!');
      expect(valid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.USER);

      await service.setPassword(user.id, 'Password123!');

      const valid = await service.verifyPassword(user.id, 'WrongPassword123!');
      expect(valid).toBe(false);
    });

    it('should return false for user without password', async () => {
      const user = service.createUser('test@example.com', 'Test User', Role.SERVICE);

      const valid = await service.verifyPassword(user.id, 'Password123!');
      expect(valid).toBe(false);
    });
  });

  describe('hasAdmin', () => {
    it('should detect if admin exists', () => {
      let hasAdmin = service.hasAdmin();
      expect(hasAdmin).toBe(false);

      service.createUser('admin@example.com', 'Admin', Role.ADMIN);
      hasAdmin = service.hasAdmin();
      expect(hasAdmin).toBe(true);
    });

    it('should return false initially', () => {
      const hasAdmin = service.hasAdmin();
      expect(hasAdmin).toBe(false);
    });
  });
});
