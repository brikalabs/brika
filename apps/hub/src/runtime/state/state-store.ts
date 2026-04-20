import { type BrikaDatabase, eq, notInArray } from '@brika/db';
import { inject, singleton } from '@brika/di';
import type { PluginError, PluginHealth } from '@brika/plugin';
import { PluginPackageSchema } from '@brika/schema';
import { Logger } from '@/runtime/logs/log-router';
import {
  DEFAULT_CHANNEL_ID,
  UPDATE_CHANNEL_IDS,
  type UpdateChannelId,
} from '@/runtime/updates/channels';
import { stateDb } from './database';
import { plugins as pluginsTable, settings as settingsTable } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InstalledPluginState {
  name: string;
  rootDirectory: string;
  entryPoint: string;
  uid: string;
  enabled: boolean;
  health: PluginHealth;
  lastError: PluginError | null;
  updatedAt: number;
  grantedPermissions: string[];
}

export interface PluginStateWithMetadata extends InstalledPluginState {
  version: string;
  metadata: PluginPackageSchema;
}

export interface HubLocation {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
}

type StateSchema = { plugins: typeof pluginsTable; settings: typeof settingsTable };

@singleton()
export class StateStore {
  private readonly logs = inject(Logger).withSource('state');
  #database: BrikaDatabase<StateSchema> | null = null;

  readonly #metadataCache = new Map<string, PluginPackageSchema>();

  private get db() {
    if (!this.#database) { throw new Error('StateStore not initialized — call init() first'); }
    return this.#database.db;
  }

  init(): void {
    this.#database = stateDb.open();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Metadata cache
  // ─────────────────────────────────────────────────────────────────────────

  async loadMetadataCache(): Promise<void> {
    await Promise.all(this.listInstalled().map((p) => this.refreshMetadata(p.name, p.rootDirectory)));
  }

  async refreshMetadata(name: string, rootDirectory: string): Promise<PluginPackageSchema> {
    const metadata = await this.#readPackageJson(rootDirectory);
    this.#metadataCache.set(name, metadata);
    return metadata;
  }

  getMetadata(name: string): PluginPackageSchema | undefined {
    return this.#metadataCache.get(name);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin queries
  // ─────────────────────────────────────────────────────────────────────────

  listInstalled(): InstalledPluginState[] {
    return this.db.select().from(pluginsTable).all().map(this.#rowToPlugin);
  }

  listInstalledWithMetadata(): PluginStateWithMetadata[] {
    return this.listInstalled()
      .map((p) => this.#withMetadata(p))
      .filter((p): p is PluginStateWithMetadata => p !== null);
  }

  get(name: string): InstalledPluginState | undefined {
    const row = this.db.select().from(pluginsTable).where(eq(pluginsTable.name, name)).get();
    return row ? this.#rowToPlugin(row) : undefined;
  }

  getWithMetadata(name: string): PluginStateWithMetadata | undefined {
    const p = this.get(name);
    return p ? (this.#withMetadata(p) ?? undefined) : undefined;
  }

  getByUid(uid: string): InstalledPluginState | undefined {
    const row = this.db.select().from(pluginsTable).where(eq(pluginsTable.uid, uid)).get();
    return row ? this.#rowToPlugin(row) : undefined;
  }

  getByUidWithMetadata(uid: string): PluginStateWithMetadata | undefined {
    const p = this.getByUid(uid);
    return p ? (this.#withMetadata(p) ?? undefined) : undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin mutations
  // ─────────────────────────────────────────────────────────────────────────

  remove(name: string): void {
    this.db.delete(pluginsTable).where(eq(pluginsTable.name, name)).run();
  }

  upsert(p: InstalledPluginState): void {
    const row = this.#pluginToRow(p);
    this.db.insert(pluginsTable).values(row).onConflictDoUpdate({
      target: pluginsTable.name,
      set: row,
    }).run();
  }

  setEnabled(name: string, enabled: boolean): void {
    this.db.update(pluginsTable)
      .set({ enabled, updatedAt: Date.now() })
      .where(eq(pluginsTable.name, name))
      .run();
  }

  setHealth(name: string, health: PluginHealth, lastError?: PluginError | null): void {
    this.db.update(pluginsTable)
      .set({
        health,
        updatedAt: Date.now(),
        ...(lastError === undefined ? {} : { lastError: lastError ? JSON.stringify(lastError) : null }),
      })
      .where(eq(pluginsTable.name, name))
      .run();
  }

  async registerPlugin(info: {
    name: string;
    rootDirectory: string;
    entryPoint: string;
    uid: string;
    enabled?: boolean;
  }): Promise<void> {
    const cur = this.get(info.name);
    const metadata = await this.refreshMetadata(info.name, info.rootDirectory);
    const grantedPermissions = JSON.stringify(cur?.grantedPermissions ?? metadata.permissions ?? []);

    const updateFields = {
      rootDirectory: info.rootDirectory,
      entryPoint: info.entryPoint,
      uid: info.uid,
      enabled: info.enabled ?? cur?.enabled ?? true,
      health: 'restarting' as const,
      lastError: null,
      updatedAt: Date.now(),
      grantedPermissions,
    };

    this.db.insert(pluginsTable)
      .values({ name: info.name, ...updateFields })
      .onConflictDoUpdate({ target: pluginsTable.name, set: updateFields })
      .run();
  }

  syncToConfig(validNames: Set<string>): void {
    const names = [...validNames];
    const condition = names.length > 0 ? notInArray(pluginsTable.name, names) : undefined;
    const removed = this.db.delete(pluginsTable).where(condition).returning({ name: pluginsTable.name }).all();
    for (const { name } of removed) {
      this.logs.info('Removing plugin state (not in config)', { pluginName: name });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin permissions
  // ─────────────────────────────────────────────────────────────────────────

  getGrantedPermissions(name: string): string[] {
    const row = this.db
      .select({ grantedPermissions: pluginsTable.grantedPermissions })
      .from(pluginsTable)
      .where(eq(pluginsTable.name, name))
      .get();
    return row?.grantedPermissions ? JSON.parse(row.grantedPermissions) as string[] : [];
  }

  setGrantedPermissions(name: string, permissions: string[]): void {
    this.db.update(pluginsTable)
      .set({ grantedPermissions: JSON.stringify(permissions), updatedAt: Date.now() })
      .where(eq(pluginsTable.name, name))
      .run();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hub settings
  // ─────────────────────────────────────────────────────────────────────────

  getHubLocation(): HubLocation | null {
    return this.#getSetting<HubLocation | null>('hubLocation', null);
  }

  setHubLocation(location: HubLocation | null): void {
    this.#setSetting('hubLocation', location);
  }

  getUpdateChannel(): UpdateChannelId {
    const raw = this.#getSetting<string>('updateChannel', DEFAULT_CHANNEL_ID);
    return UPDATE_CHANNEL_IDS.includes(raw as UpdateChannelId)
      ? (raw as UpdateChannelId)
      : DEFAULT_CHANNEL_ID;
  }

  setUpdateChannel(channel: UpdateChannelId): void {
    this.#setSetting('updateChannel', channel);
  }

  getHubTimezone(): string | null {
    return this.#getSetting<string | null>('hubTimezone', null);
  }

  setHubTimezone(timezone: string | null): void {
    this.#setSetting('hubTimezone', timezone);
  }

  applyTimezone(): void {
    const tz = this.getHubTimezone();
    if (tz) {
      process.env.TZ = tz;
      this.logs.info('Timezone applied', { timezone: tz });
    } else {
      delete process.env.TZ;
    }
  }

  isSetupCompleted(): boolean {
    return this.#getSetting<boolean>('setupCompleted', false);
  }

  setSetupCompleted(completed: boolean): void {
    this.#setSetting('setupCompleted', completed);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  #getSetting<T>(key: string, fallback: T): T {
    const row = this.db.select().from(settingsTable).where(eq(settingsTable.key, key)).get();
    if (!row) { return fallback; }
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }

  #setSetting(key: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    this.db.insert(settingsTable)
      .values({ key, value: serialized })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: serialized } })
      .run();
  }

  #rowToPlugin(row: typeof pluginsTable.$inferSelect): InstalledPluginState {
    return {
      name: row.name,
      rootDirectory: row.rootDirectory,
      entryPoint: row.entryPoint,
      uid: row.uid,
      enabled: row.enabled,
      health: row.health,
      lastError: row.lastError ? JSON.parse(row.lastError) as PluginError : null,
      updatedAt: row.updatedAt,
      grantedPermissions: row.grantedPermissions ? JSON.parse(row.grantedPermissions) as string[] : [],
    };
  }

  #pluginToRow(p: InstalledPluginState) {
    return {
      name: p.name,
      rootDirectory: p.rootDirectory,
      entryPoint: p.entryPoint,
      uid: p.uid,
      enabled: p.enabled,
      health: p.health,
      lastError: p.lastError ? JSON.stringify(p.lastError) : null,
      updatedAt: p.updatedAt,
      grantedPermissions: JSON.stringify(p.grantedPermissions),
    };
  }

  #withMetadata(p: InstalledPluginState): PluginStateWithMetadata | null {
    const metadata = this.#metadataCache.get(p.name);
    if (!metadata) {
      this.logs.warn('Plugin metadata not found in cache', { pluginName: p.name });
      return null;
    }
    return { ...p, version: metadata.version, metadata };
  }

  async #readPackageJson(pluginDir: string): Promise<PluginPackageSchema> {
    return PluginPackageSchema.parse(
      await import(`${pluginDir}/package.json`, { with: { type: 'json' } })
    );
  }
}
