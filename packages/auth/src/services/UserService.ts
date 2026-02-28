/**
 * @brika/auth - UserService
 * User CRUD backed by SQLite (bun:sqlite)
 */

import { Database } from 'bun:sqlite';
import bcryptjs from 'bcryptjs';
import { Role, Scope, User } from '../types';
import { ROLE_SCOPES } from '../constants';
import { validatePassword } from '../schemas';

import { photon } from '@brika/photon';

const AVATAR_SIZE = 256;

/** Raw row from the users table */
interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  avatar_data: Buffer | null;
  avatar_mime: string | null;
  avatar_hash: string | null;
  role: string;
  is_active: number;
  scopes: string | null;
  created_at: number;
  updated_at: number;
}

function parseScopes(raw: string | null): Scope[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set<string>(Object.values(Scope));
    return parsed.filter((s: string) => valid.has(s)) as Scope[];
  } catch {
    return [];
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: (row.role as Role) ?? Role.USER,
    avatarHash: row.avatar_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isActive: row.is_active === 1,
    scopes: parseScopes(row.scopes),
  };
}

/** Center-crop to square, compress as webp. */
export function processAvatar(input: Buffer): Buffer {
  return photon(input).resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' }).webp().toBuffer();
}

export class UserService {
  constructor(private readonly db: Database) {}

  async getUser(id: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
      | UserRow
      | undefined;
    return row ? toUser(row) : null;
  }

  async listUsers(): Promise<User[]> {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    return rows.map(toUser);
  }

  async createUser(email: string, name: string, role: Role): Promise<User> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const scopes = ROLE_SCOPES[role] ?? [];

    this.db
      .prepare(
        `INSERT INTO users (id, email, name, role, scopes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, email.toLowerCase(), name, role, JSON.stringify(scopes), now, now);

    return {
      id,
      email: email.toLowerCase(),
      name,
      role,
      avatarHash: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      isActive: true,
      scopes,
    };
  }

  async updateUser(
    id: string,
    updates: { name?: string; role?: Role; isActive?: boolean; scopes?: Scope[] }
  ): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const name = updates.name ?? user.name;

    const sets: string[] = ['name = ?', 'updated_at = ?'];
    const params: (string | number)[] = [name, now];

    if (updates.role !== undefined) {
      sets.push('role = ?');
      params.push(updates.role);
    }
    let isActive: number | undefined;
    if (updates.isActive !== undefined) {
      isActive = updates.isActive ? 1 : 0;
    }
    if (isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(isActive);
    }
    if (updates.scopes !== undefined) {
      sets.push('scopes = ?');
      params.push(JSON.stringify(updates.scopes));
    }

    params.push(id);
    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    return (await this.getUser(id))!;
  }

  /** Set avatar from raw image data (processed to webp). Returns content hash for cache busting. */
  async setAvatar(userId: string, imageData: Buffer): Promise<string> {
    const processed = processAvatar(imageData);
    const hash = Bun.hash(processed).toString(36).slice(0, 8);
    this.db
      .prepare('UPDATE users SET avatar_data = ?, avatar_mime = ?, avatar_hash = ?, updated_at = ? WHERE id = ?')
      .run(processed, 'image/webp', hash, Date.now(), userId);
    return hash;
  }

  /** Remove avatar */
  async removeAvatar(userId: string): Promise<void> {
    this.db
      .prepare('UPDATE users SET avatar_data = NULL, avatar_mime = NULL, avatar_hash = NULL, updated_at = ? WHERE id = ?')
      .run(Date.now(), userId);
  }

  /** Get raw avatar data for serving */
  getAvatarData(userId: string): { data: Buffer; mimeType: string } | null {
    const row = this.db
      .prepare('SELECT avatar_data, avatar_mime FROM users WHERE id = ?')
      .get(userId) as { avatar_data: Buffer | null; avatar_mime: string | null } | undefined;
    if (!row?.avatar_data || !row.avatar_mime) return null;
    return { data: row.avatar_data, mimeType: row.avatar_mime };
  }

  async deleteUser(email: string): Promise<void> {
    const user = await this.getUserByEmail(email);
    if (!user) throw new Error('User not found');
    if (user.role === Role.ADMIN) throw new Error('Cannot delete admin user');
    this.db.prepare('DELETE FROM users WHERE email = ?').run(email.toLowerCase());
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');
    const error = validatePassword(password);
    if (error) throw new Error(error);
    const hash = await bcryptjs.hash(password, 12);
    this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hash, Date.now(), userId);
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const row = this.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
      | { password_hash: string | null }
      | undefined;
    if (!row?.password_hash) return false;
    return bcryptjs.compare(password, row.password_hash);
  }

  async hasAdmin(): Promise<boolean> {
    return this.db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get() !== null;
  }

}
