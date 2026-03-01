/**
 * @brika/auth - AuthService
 * Handles authentication operations using server-side sessions.
 */

import { inject, injectable } from '@brika/di';
import { LoginResponse, User } from '../types';
import { ScopeService } from './ScopeService';
import { SessionService } from './SessionService';
import { UserService } from './UserService';

/**
 * Service for authentication operations
 */
@injectable()
export class AuthService {
  private readonly sessionService: SessionService;
  private readonly userService: UserService;
  private readonly scopeService: ScopeService;

  constructor(userService?: UserService) {
    if (userService) {
      this.userService = userService;
      this.sessionService = inject(SessionService);
      this.scopeService = inject(ScopeService);
    } else {
      this.sessionService = inject(SessionService);
      this.userService = inject(UserService);
      this.scopeService = inject(ScopeService);
    }
  }

  /**
   * Login with email and password.
   * Creates a server-side session and returns the raw token.
   */
  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string
  ): Promise<LoginResponse> {
    const user = this.userService.getUserByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Deactivated users must not be allowed to log in
    if (!user.isActive) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await this.userService.verifyPassword(user.id, password);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = this.sessionService.createSession(user.id, ip, userAgent);

    return {
      token,
      user,
      expiresIn: this.sessionService.getSessionTTL(),
    };
  }

  /**
   * Logout — revoke the current session.
   */
  logout(sessionId: string): void {
    this.sessionService.revokeSession(sessionId);
  }

  /**
   * Get current user from user ID.
   */
  getCurrentUser(userId: string): User | null {
    return this.userService.getUser(userId);
  }
}
