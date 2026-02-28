# @brika/auth

Complete authentication system for Brika with cookie-based sessions, scope-based RBAC, and type-safe route protection.

## Features

- **Cookie-Based Sessions** — HttpOnly, Secure, SameSite=Lax cookies with server-side SQLite session store
- **User Management** — CRUD, bcrypt password hashing (cost 12), avatar upload with image validation
- **Scope-Based RBAC** — Fine-grained permissions with role defaults and per-user overrides
- **Type-Safe Route Protection** — Single-source-of-truth route declarations with TanStack Router integration
- **Security Hardened** — Rate limiting, session limits, deactivated user checks, sliding expiration

## Quick Start

### Backend: Hub Integration

```typescript
import { auth } from '@brika/auth/server';

await bootstrap()
  .use(auth({ dataDir, server: inject(ApiServer) }))
  .start();
```

### Frontend: React Setup

```typescript
import { AuthProvider, useAuth, useCanAccess } from '@brika/auth/react';
import { Scope } from '@brika/auth';

function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const canEdit = useCanAccess(Scope.WORKFLOW_WRITE);

  return (
    <>
      <h1>Hello, {user?.name}!</h1>
      {canEdit && <EditButton />}
      <button onClick={logout}>Logout</button>
    </>
  );
}
```

## HTTP API

### POST /api/auth/login

Rate limited: 5 requests per 60 seconds per IP.

```bash
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "SecurePassword123!" }

# Response (200) — session cookie set automatically
{ "user": { "id": "...", "email": "...", "name": "...", "role": "user" } }
```

### POST /api/auth/logout

```bash
POST /api/auth/logout
# Session cookie cleared
{ "ok": true }
```

### GET /api/auth/session

```bash
GET /api/auth/session
# Returns current session info
{ "user": { ... }, "scopes": ["workflow:read", "board:read"] }
```

### Profile Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/api/auth/profile` | Required | Update name |
| PUT | `/api/auth/profile/password` | Required + Rate limited | Change password |
| PUT | `/api/auth/profile/avatar` | Required | Upload avatar (PNG/JPEG/WebP, max 5MB) |
| DELETE | `/api/auth/profile/avatar` | Required | Remove avatar |
| GET | `/api/auth/avatar/:userId` | Public | Serve avatar image |

### Admin Endpoints (requires `admin:*` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| GET | `/api/users/:id` | Get user (admin or self) |
| PUT | `/api/users/:id` | Update user |
| PUT | `/api/users/:id/password` | Reset password (revokes all sessions) |
| DELETE | `/api/users/:id` | Delete user (revokes all sessions) |

## Security

### Authentication Flow

1. Login sends credentials over HTTPS, receives `Set-Cookie` with session token
2. Session token is `HttpOnly; Secure; SameSite=Lax; Path=/api`
3. Server stores SHA-256 hash of token in SQLite (raw token never stored)
4. Token entropy: 256-bit CSPRNG (`crypto.randomBytes(32)`)

### Protections

| Threat | Protection |
|--------|-----------|
| Brute-force login | Rate limiting (5/min per IP via sliding window counter) |
| Brute-force password change | Rate limiting (10/15min per IP) |
| Session hijacking | HttpOnly + Secure + SameSite=Lax cookies |
| Deactivated user access | Checked at login AND on every session validation |
| Password cracking | bcrypt cost 12, max 72 chars (bcrypt limit) |
| Session accumulation | Per-user session limit (default: 10), automatic cleanup every 6 hours |
| Memory exhaustion | Rate limiter store capped at 10K keys with automatic eviction |
| IP spoofing | Server uses socket IP, strips client-supplied proxy headers |
| Scope enumeration | 403 responses don't reveal user's actual scopes |
| Avatar abuse | Magic byte validation (PNG/JPEG/WebP), 5MB size limit |
| DB file access | Restrictive file permissions (0o600) |

### Session Lifecycle

- **Sliding expiration**: TTL resets on each authenticated request
- **Password change**: All sessions revoked (self-change and admin reset)
- **User deletion**: All sessions explicitly revoked before deletion
- **Deactivation**: Sessions immediately invalid (checked via JOIN in validation query)
- **Expired session cleanup**: Runs on startup + every 6 hours

## Configuration

```typescript
auth({
  dataDir: '~/.brika',
  server: inject(ApiServer),
  config: {
    session: {
      ttl: 604800,           // 7 days (default)
      cookieName: 'brika_session',
      maxPerUser: 10,         // Max concurrent sessions per user
    },
    password: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecial: true,
    },
  },
});
```

## Package Structure

```
@brika/auth
├── Types & Constants — User, Session, Role, Scope, ROLE_SCOPES
├── @brika/auth/server
│   ├── AuthService     — Login, logout
│   ├── UserService     — User CRUD, passwords, avatars
│   ├── SessionService  — Session create/validate/revoke, cleanup
│   ├── ScopeService    — Permission checks
│   ├── Middleware       — verifyToken, requireAuth, requireScope, canAccess
│   ├── Routes          — HTTP API endpoints
│   └── Plugin          — Bootstrap integration with session cleanup scheduler
├── @brika/auth/client
│   └── AuthClient      — HTTP client for browser
├── @brika/auth/react
│   ├── AuthProvider    — Context with clearSession/refreshSession
│   ├── Hooks           — useAuth, useCanAccess, useCanAccessAll, etc.
│   └── HOCs            — withScopeGuard, withOptionalScope
└── @brika/auth/tanstack
    └── createProtectedRoutes — Type-safe route builder with scope guards
```

## Roles & Scopes

| Role | Default Scopes |
|------|---------------|
| `admin` | All scopes (`admin:*`) |
| `user` | workflow:*, board:*, plugin:read, settings:read |
| `guest` | workflow:read, board:read, plugin:read |

## CLI Commands

All commands are interactive (prompts for input):

```bash
brika auth user add          # Add a new user (email, name, role, password)
brika auth user list         # List all users
brika auth user edit         # Edit a user (name, role, status, password)
brika auth user delete       # Delete a user

brika auth token create      # Create an API token (user, scopes, expiration)
```

## License

MIT
