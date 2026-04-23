import { blob, index, integer, sqliteTable, text } from '@brika/db';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    role: text('role').notNull().default('user'),
    isActive: integer('is_active').default(1),
    avatarData: blob('avatar_data'),
    avatarMime: text('avatar_mime'),
    avatarHash: text('avatar_hash'),
    scopes: text('scopes').default('[]'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    index('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user_id').on(table.userId),
  ]
);

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  activeTheme: text('active_theme'),
  colorMode: text('color_mode'),
  updatedAt: integer('updated_at').notNull(),
});
