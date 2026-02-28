/**
 * @brika/auth - Zod Schemas for Validation
 */

import { z } from 'zod';
import { Role } from './roles';
import { Scope } from './scopes';
import { getAuthConfig } from './config';

const roleValues = Object.values(Role) as [Role, ...Role[]];
const scopeValues = Object.values(Scope) as [Scope, ...Scope[]];

export const RoleSchema = z.enum(roleValues);

export const ScopeSchema = z.enum(scopeValues);

export const EmailSchema = z.string().email('Invalid email address').toLowerCase();

export const NameSchema = z.string().min(2, 'Name must be at least 2 characters').max(255);

/**
 * Password schema — reads config lazily so it respects runtime overrides.
 * Uses z.string() + superRefine so all rules are evaluated at validation time.
 * Max 72 chars: bcrypt silently truncates beyond this, so enforce it explicitly.
 */
export const PasswordSchema = z.string().max(72, 'Max 72 characters').superRefine((v, ctx) => {
  const { password } = getAuthConfig();

  if (v.length < password.minLength) {
    ctx.addIssue({ code: 'custom', message: `Min ${password.minLength} characters` });
  }
  if (password.requireUppercase && !/[A-Z]/.test(v)) {
    ctx.addIssue({ code: 'custom', message: 'Need uppercase letter (A-Z)' });
  }
  if (password.requireNumbers && !/\d/.test(v)) {
    ctx.addIssue({ code: 'custom', message: 'Need number (0-9)' });
  }
  if (password.requireSpecial && !password.specialChars.test(v)) {
    ctx.addIssue({ code: 'custom', message: 'Need special character (!@#$%^&*...)' });
  }
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: EmailSchema,
  name: NameSchema,
  role: RoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  isActive: z.boolean().default(true),
});

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().email(),
  userName: z.string(),
  userRole: RoleSchema,
  scopes: z.array(ScopeSchema),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});

export const CreateUserSchema = z.object({
  email: EmailSchema,
  name: NameSchema,
  role: RoleSchema.default(Role.USER),
  password: PasswordSchema.optional(),
});

export const CreateApiTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(ScopeSchema),
  expiresAt: z.date().optional(),
});

/**
 * Validate a password against the policy.
 * Returns the first error message, or undefined if valid.
 * Compatible with @clack/prompts validate functions.
 */
export function validatePassword(value: string): string | undefined {
  const result = PasswordSchema.safeParse(value);
  if (result.success) return undefined;
  return result.error.issues[0]?.message;
}
