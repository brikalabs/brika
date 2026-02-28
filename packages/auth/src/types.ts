/**
 * @brika/auth - Core Type Definitions
 */

import type { Role } from './roles';
import type { Scope } from './scopes';

export { Role } from './roles';
export { Scope } from './scopes';

/**
 * User account
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  scopes: Scope[];
}

/**
 * Active session (attached to request context by middleware)
 */
export interface Session {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: Role;
  scopes: Scope[];
}

/**
 * Session record stored in DB
 */
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

/**
 * API token for third-party integrations
 */
export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  scopes: Scope[];
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  usageCount?: number;
}

/**
 * Response when creating an API token
 */
export interface ApiTokenCreated {
  id: string;
  name: string;
  plaintext: string;
  scopes: Scope[];
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Login request/response
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  expiresIn: number;
}

/**
 * Create user request
 */
export interface CreateUserRequest {
  email: string;
  name: string;
  role: Role;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  sessionTTL: number;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
