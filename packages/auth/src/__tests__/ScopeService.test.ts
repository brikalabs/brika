/**
 * @brika/auth - ScopeService Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ScopeService } from '../services/ScopeService';
import { Role, Scope } from '../types';

describe('ScopeService', () => {
  let service: ScopeService;

  beforeEach(() => {
    service = new ScopeService();
  });

  describe('isValidScope', () => {
    it('should validate known scopes', () => {
      expect(service.isValidScope(Scope.ADMIN_ALL)).toBe(true);
      expect(service.isValidScope(Scope.WORKFLOW_READ)).toBe(true);
      expect(service.isValidScope(Scope.SETTINGS_WRITE)).toBe(true);
    });

    it('should reject unknown scopes', () => {
      expect(service.isValidScope('unknown:scope')).toBe(false);
      expect(service.isValidScope('admin')).toBe(false);
    });
  });

  describe('validateScopes', () => {
    it('should filter valid scopes', () => {
      const mixed = [Scope.WORKFLOW_READ, 'invalid', Scope.WORKFLOW_WRITE];
      const valid = service.validateScopes(mixed);

      expect(valid).toHaveLength(2);
      expect(valid).toContain(Scope.WORKFLOW_READ);
      expect(valid).toContain(Scope.WORKFLOW_WRITE);
    });

    it('should return empty array for non-array input', () => {
      const result = service.validateScopes('not-an-array');
      expect(result).toEqual([]);
    });
  });

  describe('getScopesForRole', () => {
    it('should return admin scopes for admin role', () => {
      const scopes = service.getScopesForRole(Role.ADMIN);
      expect(scopes).toContain(Scope.ADMIN_ALL);
    });

    it('should return user scopes for user role', () => {
      const scopes = service.getScopesForRole(Role.USER);
      expect(scopes).toContain(Scope.WORKFLOW_READ);
      expect(scopes).toContain(Scope.WORKFLOW_WRITE);
      expect(scopes).not.toContain(Scope.ADMIN_ALL);
    });

    it('should return guest scopes for guest role', () => {
      const scopes = service.getScopesForRole(Role.GUEST);
      expect(scopes).toContain(Scope.WORKFLOW_READ);
      expect(scopes).not.toContain(Scope.WORKFLOW_WRITE);
    });

    it('should return empty array for service role', () => {
      const scopes = service.getScopesForRole(Role.SERVICE);
      expect(scopes).toEqual([]);
    });
  });

  describe('hasScope', () => {
    it('should check if scope is present', () => {
      const scopes = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];
      expect(service.hasScope(scopes, Scope.WORKFLOW_READ)).toBe(true);
      expect(service.hasScope(scopes, Scope.WORKFLOW_EXECUTE)).toBe(false);
    });

    it('should grant all scopes to admin', () => {
      const adminScopes = [Scope.ADMIN_ALL];
      expect(service.hasScope(adminScopes, Scope.WORKFLOW_READ)).toBe(true);
      expect(service.hasScope(adminScopes, Scope.SETTINGS_WRITE)).toBe(true);
      expect(service.hasScope(adminScopes, Scope.PLUGIN_MANAGE)).toBe(true);
    });
  });

  describe('hasScopeAny', () => {
    it('should check if any required scope is present', () => {
      const scopes = [Scope.WORKFLOW_READ];
      const required = [Scope.WORKFLOW_WRITE, Scope.WORKFLOW_READ];

      expect(service.hasScopeAny(scopes, required)).toBe(true);
    });

    it('should return false if none present', () => {
      const scopes = [Scope.BOARD_READ];
      const required = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];

      expect(service.hasScopeAny(scopes, required)).toBe(false);
    });
  });

  describe('hasScopeAll', () => {
    it('should check if all required scopes are present', () => {
      const scopes = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];
      const required = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];

      expect(service.hasScopeAll(scopes, required)).toBe(true);
    });

    it('should return false if any missing', () => {
      const scopes = [Scope.WORKFLOW_READ];
      const required = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];

      expect(service.hasScopeAll(scopes, required)).toBe(false);
    });
  });

  describe('getAllScopes', () => {
    it('should return all available scopes', () => {
      const all = service.getAllScopes();
      expect(all.length).toBeGreaterThan(0);
      expect(all).toContain(Scope.ADMIN_ALL);
      expect(all).toContain(Scope.WORKFLOW_READ);
    });
  });

  describe('getScopesByCategory', () => {
    it('should filter scopes by category', () => {
      const workflow = service.getScopesByCategory('workflow');
      expect(workflow).toContain(Scope.WORKFLOW_READ);
      expect(workflow).toContain(Scope.WORKFLOW_WRITE);
      expect(workflow).not.toContain(Scope.BOARD_READ);
    });

    it('should return admin category', () => {
      const admin = service.getScopesByCategory('admin');
      expect(admin).toContain(Scope.ADMIN_ALL);
    });
  });

  describe('getScopeDescription', () => {
    it('should return scope description', () => {
      const desc = service.getScopeDescription(Scope.WORKFLOW_READ);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });
  });

  describe('getRegistry', () => {
    it('should return scope registry', () => {
      const registry = service.getRegistry();
      expect(registry).toBeDefined();
      expect(registry[Scope.ADMIN_ALL]).toBeDefined();
      expect(registry[Scope.ADMIN_ALL].category).toBe('admin');
    });
  });
});
