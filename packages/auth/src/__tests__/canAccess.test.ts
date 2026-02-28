/**
 * @brika/auth - canAccess Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  canAccess,
  canAccessAll,
  createPermissionChecker,
  Features,
} from '../middleware/canAccess';
import { Role, Scope } from '../types';

describe('canAccess', () => {
  describe('canAccess function', () => {
    it('should return false for null/undefined scopes', () => {
      expect(canAccess(null, Scope.WORKFLOW_READ)).toBe(false);
      expect(canAccess(undefined, Scope.WORKFLOW_READ)).toBe(false);
      expect(canAccess([], Scope.WORKFLOW_READ)).toBe(false);
    });

    it('should check single scope', () => {
      const scopes = [Scope.WORKFLOW_READ];
      expect(canAccess(scopes, Scope.WORKFLOW_READ)).toBe(true);
      expect(canAccess(scopes, Scope.WORKFLOW_WRITE)).toBe(false);
    });

    it('should check multiple scopes (any)', () => {
      const scopes = [Scope.WORKFLOW_READ, Scope.BOARD_READ];
      const required = [Scope.WORKFLOW_WRITE, Scope.WORKFLOW_READ];
      expect(canAccess(scopes, required)).toBe(true);
    });

    it('should grant all to admin', () => {
      const scopes = [Scope.ADMIN_ALL];
      expect(canAccess(scopes, Scope.WORKFLOW_READ)).toBe(true);
      expect(canAccess(scopes, Scope.PLUGIN_MANAGE)).toBe(true);
      expect(canAccess(scopes, Scope.SETTINGS_WRITE)).toBe(true);
    });

    it('should handle array input', () => {
      const scopes = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];
      const required = [Scope.WORKFLOW_WRITE, Scope.WORKFLOW_EXECUTE];
      expect(canAccess(scopes, required)).toBe(true); // Has one
    });
  });

  describe('canAccessAll function', () => {
    it('should return false for null/undefined scopes', () => {
      expect(canAccessAll(null, [Scope.WORKFLOW_READ])).toBe(false);
      expect(canAccessAll(undefined, [Scope.WORKFLOW_READ])).toBe(false);
    });

    it('should check all required scopes', () => {
      const scopes = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];
      expect(canAccessAll(scopes, [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE])).toBe(true);
      expect(canAccessAll(scopes, [Scope.WORKFLOW_READ, Scope.WORKFLOW_EXECUTE])).toBe(false);
    });

    it('should grant all to admin', () => {
      const scopes = [Scope.ADMIN_ALL];
      expect(
        canAccessAll(scopes, [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE, Scope.PLUGIN_MANAGE])
      ).toBe(true);
    });
  });

  describe('createPermissionChecker', () => {
    it('should create feature permission object', () => {
      const WorkflowPerms = createPermissionChecker('Workflow', {
        read: Scope.WORKFLOW_READ,
        write: Scope.WORKFLOW_WRITE,
        execute: Scope.WORKFLOW_EXECUTE,
      });

      expect(typeof WorkflowPerms.read).toBe('function');
      expect(typeof WorkflowPerms.write).toBe('function');
      expect(typeof WorkflowPerms.execute).toBe('function');
    });

    it('should check permissions correctly', () => {
      const WorkflowPerms = createPermissionChecker('Workflow', {
        read: Scope.WORKFLOW_READ,
        write: Scope.WORKFLOW_WRITE,
      });

      const userScopes = [Scope.WORKFLOW_READ];
      expect(WorkflowPerms.read(userScopes)).toBe(true);
      expect(WorkflowPerms.write(userScopes)).toBe(false);
    });

    it('should support array scopes', () => {
      const AdminPerms = createPermissionChecker('Admin', {
        fullAccess: [Scope.ADMIN_ALL],
        userManagement: [Scope.ADMIN_ALL],
      });

      const adminScopes = [Scope.ADMIN_ALL];
      expect(AdminPerms.fullAccess(adminScopes)).toBe(true);
      expect(AdminPerms.userManagement(adminScopes)).toBe(true);
    });
  });

  describe('Features preset', () => {
    it('should have Workflow feature', () => {
      expect(Features.Workflow.read).toBeDefined();
      expect(Features.Workflow.write).toBeDefined();
      expect(Features.Workflow.execute).toBeDefined();
    });

    it('should check Workflow permissions', () => {
      const userScopes = [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE];
      expect(Features.Workflow.read(userScopes)).toBe(true);
      expect(Features.Workflow.write(userScopes)).toBe(true);
      expect(Features.Workflow.execute(userScopes)).toBe(false);
    });

    it('should have Board feature', () => {
      expect(Features.Board.read).toBeDefined();
      expect(Features.Board.write).toBeDefined();
    });

    it('should have Plugin feature', () => {
      expect(Features.Plugin.read).toBeDefined();
      expect(Features.Plugin.manage).toBeDefined();
    });

    it('should have Settings feature', () => {
      expect(Features.Settings.read).toBeDefined();
      expect(Features.Settings.write).toBeDefined();
    });

    it('should have Admin feature', () => {
      expect(Features.Admin.all).toBeDefined();
    });

    it('should work with admin scopes', () => {
      const adminScopes = [Scope.ADMIN_ALL];
      expect(Features.Workflow.execute(adminScopes)).toBe(true);
      expect(Features.Board.write(adminScopes)).toBe(true);
      expect(Features.Admin.all(adminScopes)).toBe(true);
    });
  });
});
