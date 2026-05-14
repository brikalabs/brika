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

/** Transport a session was opened over. */
export type ConnectionType = 'http' | 'rtc' | 'ws';

/**
 * Header the hub's WebRTC `RpcServer` stamps on requests it synthesizes from
 * data-channel frames. Read by the auth flow (login + per-request middleware)
 * to record how each session was opened. Single source of truth — don't
 * hardcode this string elsewhere.
 */
export const TRANSPORT_HEADER = 'x-brika-transport';

/** Parse a `x-brika-transport` header value. Defaults to 'http' for unknown/missing. */
export function parseTransportHeader(value: string | null | undefined): ConnectionType {
  return value === 'rtc' || value === 'ws' ? value : 'http';
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
  connectionType: ConnectionType;
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
