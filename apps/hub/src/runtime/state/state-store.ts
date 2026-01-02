import { singleton, inject } from "@elia/shared";
import type { PluginHealth, PluginSummary, Rule, Schedule } from "@elia/shared";
import { HubConfig } from "../config";

export interface InstalledPluginState {
  ref: string;
  wanted?: string;
  resolved?: string;
  enabled: boolean;
  health: PluginHealth;
  lastError?: string | null;
  updatedAt: number;
}

type StateFile = {
  plugins: Record<string, InstalledPluginState>;
  schedules: Record<string, Schedule>;
  rules: Record<string, Rule>;
};

@singleton()
export class StateStore {
  private readonly config = inject(HubConfig);
  readonly #homeDir: string;
  readonly #file: string;
  #state: StateFile = { plugins: {}, schedules: {}, rules: {} };

  constructor() {
    this.#homeDir = this.config.homeDir;
    this.#file = `${this.#homeDir}/state.json`;
  }

  async init(): Promise<void> {
    await Bun.write(Bun.file(`${this.#homeDir}/.keep`), "");
    const file = Bun.file(this.#file);
    if (!(await file.exists())) {
      await this.#flush();
      return;
    }
    const parsed = JSON.parse(await file.text()) as Partial<StateFile>;
    this.#state = {
      plugins: parsed.plugins ?? {},
      schedules: parsed.schedules ?? {},
      rules: parsed.rules ?? {},
    };
  }

  listInstalled(): InstalledPluginState[] {
    return Object.values(this.#state.plugins);
  }
  get(ref: string): InstalledPluginState | undefined {
    return this.#state.plugins[ref];
  }

  /** Remove a plugin entry from state (used to clean up stale entries) */
  async remove(ref: string): Promise<void> {
    delete this.#state.plugins[ref];
    await this.#flush();
  }

  async upsert(p: InstalledPluginState): Promise<void> {
    this.#state.plugins[p.ref] = p;
    await this.#flush();
  }

  async setEnabled(ref: string, enabled: boolean): Promise<void> {
    const cur = this.#state.plugins[ref] ?? {
      ref,
      enabled: false,
      health: "stopped" as const,
      updatedAt: Date.now(),
    };
    cur.enabled = enabled;
    cur.updatedAt = Date.now();
    this.#state.plugins[ref] = cur;
    await this.#flush();
  }

  async setHealth(ref: string, health: PluginHealth, lastError?: string | null): Promise<void> {
    const cur = this.#state.plugins[ref] ?? {
      ref,
      enabled: false,
      health: "stopped" as const,
      updatedAt: Date.now(),
    };
    cur.health = health;
    cur.lastError = lastError ?? cur.lastError ?? null;
    cur.updatedAt = Date.now();
    this.#state.plugins[ref] = cur;
    await this.#flush();
  }

  summarize(ref: string): PluginSummary {
    const s = this.#state.plugins[ref];
    return { ref, health: s?.health ?? "stopped", tools: [], lastError: s?.lastError ?? null };
  }

  async #flush(): Promise<void> {
    await Bun.write(this.#file, JSON.stringify(this.#state, null, 2));
  }

  // Schedules
  listSchedules(): Schedule[] {
    return Object.values(this.#state.schedules);
  }
  getSchedule(id: string): Schedule | undefined {
    return this.#state.schedules[id];
  }
  async upsertSchedule(s: Schedule): Promise<void> {
    this.#state.schedules[s.id] = s;
    await this.#flush();
  }
  async deleteSchedule(id: string): Promise<void> {
    delete this.#state.schedules[id];
    await this.#flush();
  }

  // Rules
  listRules(): Rule[] {
    return Object.values(this.#state.rules);
  }
  getRule(id: string): Rule | undefined {
    return this.#state.rules[id];
  }
  async upsertRule(r: Rule): Promise<void> {
    this.#state.rules[r.id] = r;
    await this.#flush();
  }
  async deleteRule(id: string): Promise<void> {
    delete this.#state.rules[id];
    await this.#flush();
  }
}
