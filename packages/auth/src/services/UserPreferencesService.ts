/**
 * @brika/auth - UserPreferencesService
 * Per-user preferences (active theme, color mode). Row created on first write.
 */

import type { Database } from 'bun:sqlite';

export type ColorMode = 'light' | 'dark' | 'system';

export interface UserPreferences {
  activeTheme: string | null;
  colorMode: ColorMode | null;
}

interface UserPreferencesRow {
  user_id: string;
  active_theme: string | null;
  color_mode: string | null;
  updated_at: number;
}

const VALID_MODES: readonly ColorMode[] = ['light', 'dark', 'system'];

function normalizeMode(raw: string | null): ColorMode | null {
  return raw && (VALID_MODES as readonly string[]).includes(raw) ? (raw as ColorMode) : null;
}

export class UserPreferencesService {
  constructor(private readonly db: Database) {}

  get(userId: string): UserPreferences {
    const row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as
      | UserPreferencesRow
      | undefined;
    if (!row) {
      return { activeTheme: null, colorMode: null };
    }
    return {
      activeTheme: row.active_theme,
      colorMode: normalizeMode(row.color_mode),
    };
  }

  update(userId: string, patch: Partial<UserPreferences>): UserPreferences {
    const current = this.get(userId);
    const next: UserPreferences = {
      activeTheme: patch.activeTheme !== undefined ? patch.activeTheme : current.activeTheme,
      colorMode: patch.colorMode !== undefined ? patch.colorMode : current.colorMode,
    };
    this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, active_theme, color_mode, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           active_theme = excluded.active_theme,
           color_mode = excluded.color_mode,
           updated_at = excluded.updated_at`
      )
      .run(userId, next.activeTheme, next.colorMode, Date.now());
    return next;
  }
}
