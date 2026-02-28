/**
 * @brika/auth - Per-user scopes (allow-list) tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { openAuthDatabase } from '../setup';
import { UserService } from '../services/UserService';
import { SessionService } from '../services/SessionService';
import { Role, Scope } from '../types';
import { ROLE_SCOPES } from '../constants';

describe('Per-user scopes (allow-list)', () => {
  let userService: UserService;
  let sessionService: SessionService;

  beforeEach(() => {
    const db = openAuthDatabase(':memory:');
    userService = new UserService(db);
    sessionService = new SessionService(db, 3600);
  });

  it('should grant role default scopes to new users', async () => {
    const user = await userService.createUser('test@test.com', 'Test', Role.USER);
    expect(user.scopes).toEqual(ROLE_SCOPES[Role.USER]);

    const token = sessionService.createSession(user.id);
    const session = sessionService.validateSession(token);
    expect(session).not.toBeNull();
    expect(session!.scopes).toEqual(ROLE_SCOPES[Role.USER]);
  });

  it('should use only explicitly granted scopes in session', async () => {
    const user = await userService.createUser('test@test.com', 'Test', Role.USER);
    await userService.updateUser(user.id, {
      scopes: [Scope.WORKFLOW_READ, Scope.WORKFLOW_EXECUTE],
    });

    const token = sessionService.createSession(user.id);
    const session = sessionService.validateSession(token);

    expect(session).not.toBeNull();
    expect(session!.scopes).toContain(Scope.WORKFLOW_READ);
    expect(session!.scopes).toContain(Scope.WORKFLOW_EXECUTE);
    expect(session!.scopes).not.toContain(Scope.WORKFLOW_WRITE);
    expect(session!.scopes).not.toContain(Scope.BOARD_WRITE);
  });

  it('should always grant admin scopes regardless of stored scopes', async () => {
    const user = await userService.createUser('admin@test.com', 'Admin', Role.ADMIN);
    // Even if scopes are manually narrowed, admin always gets ADMIN_ALL
    await userService.updateUser(user.id, {
      scopes: [Scope.WORKFLOW_READ],
    });

    const token = sessionService.createSession(user.id);
    const session = sessionService.validateSession(token);

    expect(session).not.toBeNull();
    expect(session!.scopes).toContain(Scope.ADMIN_ALL);
  });

  it('should persist and retrieve scopes on User object', async () => {
    const user = await userService.createUser('test@test.com', 'Test', Role.USER);
    const updated = await userService.updateUser(user.id, {
      scopes: [Scope.PLUGIN_READ, Scope.BOARD_READ],
    });

    expect(updated.scopes).toEqual([Scope.PLUGIN_READ, Scope.BOARD_READ]);
  });

  it('should handle empty scopes (no permissions)', async () => {
    const user = await userService.createUser('test@test.com', 'Test', Role.USER);
    const updated = await userService.updateUser(user.id, {
      scopes: [],
    });

    expect(updated.scopes).toEqual([]);

    const token = sessionService.createSession(user.id);
    const session = sessionService.validateSession(token);
    expect(session!.scopes).toEqual([]);
  });

  it('should grant role-appropriate defaults for each role', async () => {
    const guest = await userService.createUser('guest@test.com', 'Guest', Role.GUEST);
    expect(guest.scopes).toEqual(ROLE_SCOPES[Role.GUEST]);

    const admin = await userService.createUser('admin@test.com', 'Admin', Role.ADMIN);
    expect(admin.scopes).toEqual(ROLE_SCOPES[Role.ADMIN]);
  });

  it('should drop invalid scope strings when reading from DB', async () => {
    const user = await userService.createUser('test@test.com', 'Test', Role.USER);
    await userService.updateUser(user.id, {
      scopes: [Scope.WORKFLOW_READ, 'not:a:scope' as Scope],
    });

    const fetched = await userService.getUser(user.id);
    expect(fetched!.scopes).toEqual([Scope.WORKFLOW_READ]);
  });
});
