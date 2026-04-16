/**
 * Re-export auth prompt helpers through a local module.
 *
 * Tests mock this file instead of @/cli/auth-prompts directly,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 *
 * IMPORTANT: Use destructured import (not `export { } from`) so that
 * Bun's mock.module() does NOT follow the re-export chain and replace
 * the original auth-prompts module.
 */
import * as authPrompts from '../../auth-prompts';

export const {
  promptAddUser,
  promptCreateToken,
  promptDeleteUser,
  promptEditUser,
  promptEmail,
  promptSelectUser,
  showError,
  showSuccess,
  validators,
} = authPrompts;
