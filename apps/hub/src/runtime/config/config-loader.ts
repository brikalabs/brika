/**
 * BRIKA Configuration Loader
 *
 * Loads and validates brika.yml configuration
 */

import { inject, singleton } from '@brika/di';
import { BytesSchema, DurationSchema, formatBytes, formatDuration } from '@brika/schema';
import YAML from 'yaml';
import { z } from 'zod';
import { Logger } from '../logs/log-router';
import { BrikaInitializer } from './brika-initializer';
import {
  operatorSearchStores,
  parseOperatorRegistries,
  type RegistryDescriptor,
  resolveRegistries,
} from './registries';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plugin entry with version and optional config.
 */
export interface PluginEntry {
  /** Package name (e.g., "@brika/plugin-timer") */
  name: string;
  /** Version specifier (e.g., "^1.0.0", "workspace:./plugins/timer") */
  version: string;
  /** Plugin configuration values */
  config?: Record<string, unknown>;
}

export interface RuleEntry {
  name: string;
  event: string;
  condition: string;
  action: { tool: string; args: Record<string, unknown> };
  enabled: boolean;
}

export interface ScheduleEntry {
  name: string;
  trigger: { type: 'cron'; expr: string } | { type: 'interval'; ms: number };
  action: { tool: string; args: Record<string, unknown> };
  enabled: boolean;
}

/**
 * Default time the hub waits for in-flight requests to drain and for
 * subsystems to stop cleanly before a hard-timeout forces exit. Tuned
 * to comfortably cover a slow request finishing without leaving an
 * operator staring at a hung process — long enough to drain, short
 * enough that a wedged shutdown still terminates promptly.
 */
const DEFAULT_SHUTDOWN_GRACE_PERIOD_MS = 10_000;

/**
 * Graceful-shutdown settings, validated at load time. A non-positive or
 * non-finite value would defeat the hard-timeout fallback (the process
 * could hang forever), so zod coerces and clamps it to a sane minimum.
 */
const ShutdownConfigSchema = z.object({
  /**
   * Upper bound, in milliseconds, on the whole shutdown sequence:
   * request draining plus subsystem teardown. When exceeded, the hub
   * force-closes connections, flushes logs, and exits.
   */
  gracePeriodMs: z.coerce
    .number()
    .int()
    .positive()
    .catch(DEFAULT_SHUTDOWN_GRACE_PERIOD_MS)
    .default(DEFAULT_SHUTDOWN_GRACE_PERIOD_MS),
});

export type ShutdownConfig = z.infer<typeof ShutdownConfigSchema>;

/**
 * Validates a single CORS allowlist entry: it must be a well-formed
 * absolute `http(s)` origin with no path/query/fragment, normalised to its
 * `URL().origin` form so matching is exact (e.g. `https://app.example.com`).
 * Anything malformed is rejected so a typo can't silently widen the policy.
 */
const corsOriginSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return false;
        }
        // Reject entries carrying a path/query/fragment — an origin is
        // scheme + host + port only, and the matcher compares against
        // `Origin` headers which never include a path.
        return url.origin === value.replace(/\/$/, '');
      } catch {
        return false;
      }
    },
    { message: 'must be an absolute http(s) origin, e.g. https://app.example.com' }
  )
  .transform((value) => new URL(value).origin);

const corsAllowlistSchema = z.array(corsOriginSchema).default([]);

/**
 * Validate and normalise an arbitrary CORS allowlist value with zod. Returns
 * the canonical `URL().origin` form of each valid entry, or `null` when the
 * value is malformed so callers can log and fall back. Shared by the config
 * loader and the `BRIKA_CORS_ALLOWLIST` env override path.
 */
export function safeParseCorsAllowlist(raw: unknown): { origins: string[] } | { issues: string[] } {
  const result = corsAllowlistSchema.safeParse(raw ?? []);
  if (result.success) {
    return { origins: result.data };
  }
  return { issues: result.error.issues.map((issue) => issue.message) };
}

// ─── Multi-registry config ────────────────────────────────────────────────────
// `npmRegistries` routes installs per scope (written to the plugins-dir `.npmrc`);
// `searchStores` are `/v1`-conforming bases the hub searches and reads details from.
// Both default to the Brika registry/store; the env vars override only the defaults.

const BRIKA_DEFAULT_REGISTRY = 'https://registry.brika.dev';
const BRIKA_DEFAULT_STORE = 'https://store.brika.dev';

/** Drop a trailing slash so `${base}/v1/...` never doubles up. */
const trimUrl = (url: string): string => url.trim().replace(/\/$/, '');

/** scope -> npm-registry URL. A malformed map degrades to empty rather than failing the load. */
const NpmRegistriesSchema = z.record(z.string(), z.string()).catch({});
/** `/v1` store base URLs. A malformed list degrades to empty. */
const SearchStoresSchema = z.array(z.string()).catch([]);

/** The npm-protocol registry probed for scoped plugins whose scope isn't explicitly mapped. */
function defaultRegistry(): string {
  return trimUrl(process.env.BRIKA_REGISTRY_URL || BRIKA_DEFAULT_REGISTRY);
}
/** Default search stores: the Brika store, `BRIKA_STORE_URL` overriding it. */
function defaultSearchStores(): string[] {
  return [trimUrl(process.env.BRIKA_STORE_URL || BRIKA_DEFAULT_STORE)];
}

export interface BrikaConfig {
  hub: {
    port: number;
    host: string;
    /**
     * Explicit production CORS allowlist. Exact origins pinned here are
     * always permitted in addition to the built-in LAN/dev defaults
     * (loopback, RFC1918, `*.local`, `hub.brika.dev`). Empty by default,
     * which preserves the LAN-only behaviour for local/dev setups.
     */
    corsAllowlist: string[];
    plugins: {
      heartbeatInterval: number;
      heartbeatTimeout: number;
      /**
       * Per-plugin RSS soft-limit in bytes. When a plugin's resident set size
       * stays above this for a sustained period the hub triggers a graceful
       * restart (through the existing RestartPolicy backoff) rather than
       * killing it abruptly. `0` disables the limit (no RSS-based restarts).
       */
      rssSoftLimitBytes: number;
      /**
       * Scale-to-zero: reap an idle plugin process after this many milliseconds
       * with no activity (no block input, route call, tool call, or trigger
       * fire). `0` disables reaping (plugins stay resident, the behaviour
       * before scale-to-zero). A plugin that hosts a live (not yet hub-hosted)
       * trigger block is never reaped regardless of this value.
       */
      idleReapMs: number;
      /**
       * Keep the N most-recently-active plugins resident even once their idle
       * window elapses, to hide cold-start latency on the hot set. `0` keeps
       * none warm (every idle plugin is eligible for reaping).
       */
      keepWarmCount: number;
      /**
       * Compile plugin server bundles to JSC bytecode (`bun build --bytecode`)
       * so cold starts skip parse/compile. Off by default; bytecode is tied to
       * the Bun version and is regenerated transparently on mismatch.
       */
      bytecode: boolean;
      /**
       * Operator-wide per-root disk-quota defaults (bytes). Override the hub's
       * built-in defaults per deployment (a single-tenant box may want more, a
       * multi-tenant one less). A plugin's own `package.json` quotas still win
       * over these; omitted roots fall back to the built-in defaults.
       */
      quotas?: { data?: number; cache?: number; tmp?: number };
    };
    logs: {
      /**
       * Drop log rows older than this many days during periodic pruning.
       * 0 disables retention (keep everything — log file grows unbounded).
       */
      retentionDays: number;
      /**
       * How often (in milliseconds) the retention sweep runs. Defaults
       * to 1 hour; setting too low wastes CPU, too high risks bloat.
       */
      pruneIntervalMs: number;
    };
    analytics: {
      /**
       * Drop captured feature-usage events older than this many days during
       * periodic pruning. 0 disables retention (events grow unbounded).
       */
      retentionDays: number;
      /** How often (in milliseconds) the analytics retention sweep runs. */
      pruneIntervalMs: number;
    };
    sparks: {
      /** Drop spark rows older than this many days. 0 disables retention. */
      retentionDays: number;
      /** How often (in milliseconds) the spark retention sweep runs. */
      pruneIntervalMs: number;
    };
    workflows: {
      /** Drop workflow runs (and their events) older than this many days. 0 disables retention. */
      retentionDays: number;
      /** How often (in milliseconds) the workflow-run retention sweep runs. */
      pruneIntervalMs: number;
    };
    shutdown: ShutdownConfig;
  };
  plugins: PluginEntry[];
  rules: RuleEntry[];
  schedules: ScheduleEntry[];
  /**
   * npm-protocol registry probed for a scoped plugin whose scope isn't in `npmRegistries`: when it
   * serves the package, the hub auto-routes that scope to it. Absent disables auto-routing.
   */
  defaultRegistry?: string;
  /** Explicit scope -> npm-registry overrides (`.npmrc` install routing); auto-routing fills this. */
  npmRegistries: Record<string, string>;
  /** `/v1`-conforming store base URLs the hub searches and reads plugin details from. */
  searchStores: string[];
  /**
   * Declarative registry catalogue (built-in `npm` + `brika` presets, extended by the `registries:`
   * block in `brika.yml`). Source of truth for each registry's display name, plugin-URL template,
   * search/install method, and README/icon source. The flat `searchStores` list above stays the set
   * actually queried (see {@link ConfigLoader.getSearchStores}).
   */
  registries: RegistryDescriptor[];
}

/**
 * Default per-plugin RSS soft-limit: 512 MiB. Generous enough for media
 * plugins under normal load, low enough to catch a runaway leak before it
 * starves the host. Operators tune this per deployment; `0` disables it.
 */
const DEFAULT_RSS_SOFT_LIMIT_BYTES = 512 * 1024 * 1024;

/**
 * Scale-to-zero defaults. `idleReapMs: 0` keeps the pre-scale-to-zero
 * behaviour (plugins resident forever) so the feature is strictly opt-in;
 * operators enable it by setting a positive idle window in `brika.yml`.
 */
const DEFAULT_IDLE_REAP_MS = 0;
const DEFAULT_KEEP_WARM_COUNT = 0;
const DEFAULT_BYTECODE = false;

/**
 * Default config *template*. Never assign this object (or its nested
 * arrays) to `this.#config` directly — mutating methods like `addPlugin`
 * push into `config.plugins`, which would corrupt this module-level
 * constant for every other loader instance (and every other test file
 * that imports this module). Always go through {@link defaultConfig} to
 * get a fresh, independently-mutable copy.
 */
const DEFAULT_CONFIG: BrikaConfig = {
  hub: {
    port: 3001,
    host: '0.0.0.0',
    corsAllowlist: [],
    plugins: {
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
      rssSoftLimitBytes: DEFAULT_RSS_SOFT_LIMIT_BYTES,
      idleReapMs: DEFAULT_IDLE_REAP_MS,
      keepWarmCount: DEFAULT_KEEP_WARM_COUNT,
      bytecode: DEFAULT_BYTECODE,
    },
    logs: {
      retentionDays: 7,
      pruneIntervalMs: 60 * 60 * 1000,
    },
    analytics: {
      retentionDays: 90,
      pruneIntervalMs: 60 * 60 * 1000,
    },
    sparks: {
      retentionDays: 30,
      pruneIntervalMs: 60 * 60 * 1000,
    },
    workflows: {
      retentionDays: 30,
      pruneIntervalMs: 60 * 60 * 1000,
    },
    shutdown: {
      gracePeriodMs: DEFAULT_SHUTDOWN_GRACE_PERIOD_MS,
    },
  },
  plugins: [],
  rules: [],
  schedules: [],
  defaultRegistry: BRIKA_DEFAULT_REGISTRY,
  npmRegistries: {},
  searchStores: [BRIKA_DEFAULT_STORE],
  registries: [],
};

/** Fresh, independently-mutable copy of {@link DEFAULT_CONFIG}, with env-resolved registry defaults. */
function defaultConfig(): BrikaConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.defaultRegistry = defaultRegistry();
  config.searchStores = defaultSearchStores();
  config.registries = resolveRegistries([]);
  return config;
}

/** `keepWarmCount` is a plain non-negative integer; `bytecode` a native YAML boolean. */
const KeepWarmCountSchema = z.coerce.number().int().nonnegative().catch(DEFAULT_KEEP_WARM_COUNT);
const BytecodeSchema = z.boolean().catch(DEFAULT_BYTECODE);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Narrow an unknown YAML node to a plain object map (empty when it isn't one). */
function asRecord(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).catch({}).parse(value);
}

/**
 * Read a YAML duration value (`"5s"`, `"1h"`, `"7d"`, or raw ms) into integer
 * milliseconds, falling back to `fallback` when absent or malformed (so a typo
 * in a tuning knob doesn't fail the whole load).
 */
function readDurationMs(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  return DurationSchema.catch(fallback).parse(raw);
}

/** Read a YAML byte value (`"512mb"`, `"2gb"`, or raw bytes), falling back when absent/malformed. */
function readBytes(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  return BytesSchema.catch(fallback).parse(raw);
}

/** Read an optional byte value: a valid value, or `undefined` when absent/malformed. */
function readOptionalBytes(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const parsed = BytesSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Parse the optional `hub.plugins.quotas` override map; `undefined` when no roots are set. */
function readQuotaOverrides(
  raw: unknown
): { data?: number; cache?: number; tmp?: number } | undefined {
  const rec = asRecord(raw);
  const out: { data?: number; cache?: number; tmp?: number } = {};
  const data = readOptionalBytes(rec.data);
  const cache = readOptionalBytes(rec.cache);
  const tmp = readOptionalBytes(rec.tmp);
  if (data !== undefined) {
    out.data = data;
  }
  if (cache !== undefined) {
    out.cache = cache;
  }
  if (tmp !== undefined) {
    out.tmp = tmp;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read a retention window expressed as a duration (`"7d"`, `"90d"`, `"36h"`)
 * into a (possibly fractional) day count, the unit the log/analytics stores
 * still consume internally. `0`/absent disables retention.
 */
function readRetentionDays(raw: unknown, fallbackDays: number): number {
  if (raw === undefined || raw === null) {
    return fallbackDays;
  }
  return DurationSchema.catch(fallbackDays * DAY_MS).parse(raw) / DAY_MS;
}

/** Serialize the optional per-root quota overrides back to readable byte strings. */
function serializeQuotaOverrides(quotas: {
  data?: number;
  cache?: number;
  tmp?: number;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (quotas.data !== undefined) {
    out.data = formatBytes(quotas.data);
  }
  if (quotas.cache !== undefined) {
    out.cache = formatBytes(quotas.cache);
  }
  if (quotas.tmp !== undefined) {
    out.tmp = formatBytes(quotas.tmp);
  }
  return out;
}

/**
 * Serialize the in-memory hub config to the human-friendly YAML shape: readable
 * units (`5s`/`512mb`/`7d`) and suffix-free key names. The inverse of the parse
 * in {@link ConfigLoader.load}. Normalizes the file to the friendly form on every
 * save, so an operator who typed raw numbers sees them tidied up.
 */
function hubToYaml(hub: BrikaConfig['hub']): Record<string, unknown> {
  return {
    port: hub.port,
    host: hub.host,
    corsAllowlist: hub.corsAllowlist,
    plugins: {
      heartbeat: formatDuration(hub.plugins.heartbeatInterval),
      heartbeatTimeout: formatDuration(hub.plugins.heartbeatTimeout),
      rssSoftLimit: formatBytes(hub.plugins.rssSoftLimitBytes),
      idleReap: formatDuration(hub.plugins.idleReapMs),
      keepWarmCount: hub.plugins.keepWarmCount,
      bytecode: hub.plugins.bytecode,
      ...(hub.plugins.quotas ? { quotas: serializeQuotaOverrides(hub.plugins.quotas) } : {}),
    },
    logs: {
      retention: formatDuration(hub.logs.retentionDays * DAY_MS),
      pruneInterval: formatDuration(hub.logs.pruneIntervalMs),
    },
    analytics: {
      retention: formatDuration(hub.analytics.retentionDays * DAY_MS),
      pruneInterval: formatDuration(hub.analytics.pruneIntervalMs),
    },
    sparks: {
      retention: formatDuration(hub.sparks.retentionDays * DAY_MS),
      pruneInterval: formatDuration(hub.sparks.pruneIntervalMs),
    },
    workflows: {
      retention: formatDuration(hub.workflows.retentionDays * DAY_MS),
      pruneInterval: formatDuration(hub.workflows.pruneIntervalMs),
    },
    shutdown: {
      gracePeriod: formatDuration(hub.shutdown.gracePeriodMs),
    },
  };
}

const SECRET_PREFIX = '__secret_';

function sanitizeSecretSentinels(
  config: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!config) {
    return config;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = key.startsWith(SECRET_PREFIX) ? null : value;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Loader
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class ConfigLoader {
  readonly #init = inject(BrikaInitializer);
  readonly #logger = inject(Logger);

  #config: BrikaConfig | null = null;
  /** `/v1` store URLs declared by operator `registries:` entries (built-ins excluded), unioned into
   * {@link getSearchStores}. Set at load; empty for the default (no-file) config. */
  #operatorStoreUrls: string[] = [];

  get configPath(): string {
    return `${this.#init.brikaDir}/brika.yml`;
  }

  get rootDir(): string {
    return this.#init.rootDir;
  }

  get brikaDir(): string {
    return this.#init.brikaDir;
  }

  get systemDir(): string {
    return this.#init.systemDir;
  }

  async load(): Promise<BrikaConfig> {
    if (this.#config) {
      return this.#config;
    }

    try {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        this.#logger.info('Configuration file not found, using default configuration', {
          configPath: this.configPath,
        });
        this.#config = defaultConfig();
        return this.#config;
      }

      const content = await file.text();
      const parsed = asRecord(YAML.parse(content));

      const hubParsed = asRecord(parsed.hub);
      const hubPluginsParsed = asRecord(hubParsed.plugins);
      const hubLogsParsed = asRecord(hubParsed.logs);
      const hubAnalyticsParsed = asRecord(hubParsed.analytics);
      const hubSparksParsed = asRecord(hubParsed.sparks);
      const hubWorkflowsParsed = asRecord(hubParsed.workflows);
      const hubShutdownParsed = asRecord(hubParsed.shutdown);
      const defaults = DEFAULT_CONFIG.hub;

      // Declarative registry catalogue: built-in presets extended by the operator's `registries:`
      // block. The flat `searchStores` key stays the runtime-mutable list; an operator registry's
      // `/v1` store is unioned into the effective search set (see getSearchStores).
      const operatorRegistries = parseOperatorRegistries(parsed.registries);
      this.#operatorStoreUrls = operatorSearchStores(operatorRegistries);

      this.#config = {
        hub: {
          port: typeof hubParsed.port === 'number' ? hubParsed.port : defaults.port,
          host: typeof hubParsed.host === 'string' ? hubParsed.host : defaults.host,
          corsAllowlist: this.#parseCorsAllowlist(hubParsed.corsAllowlist),
          plugins: {
            heartbeatInterval: readDurationMs(
              hubPluginsParsed.heartbeat,
              defaults.plugins.heartbeatInterval
            ),
            heartbeatTimeout: readDurationMs(
              hubPluginsParsed.heartbeatTimeout,
              defaults.plugins.heartbeatTimeout
            ),
            rssSoftLimitBytes: readBytes(
              hubPluginsParsed.rssSoftLimit,
              defaults.plugins.rssSoftLimitBytes
            ),
            idleReapMs: readDurationMs(hubPluginsParsed.idleReap, defaults.plugins.idleReapMs),
            keepWarmCount: KeepWarmCountSchema.parse(hubPluginsParsed.keepWarmCount),
            bytecode: BytecodeSchema.parse(hubPluginsParsed.bytecode),
            ...(readQuotaOverrides(hubPluginsParsed.quotas) !== undefined
              ? { quotas: readQuotaOverrides(hubPluginsParsed.quotas) }
              : {}),
          },
          logs: {
            retentionDays: readRetentionDays(hubLogsParsed.retention, defaults.logs.retentionDays),
            pruneIntervalMs: readDurationMs(
              hubLogsParsed.pruneInterval,
              defaults.logs.pruneIntervalMs
            ),
          },
          analytics: {
            retentionDays: readRetentionDays(
              hubAnalyticsParsed.retention,
              defaults.analytics.retentionDays
            ),
            pruneIntervalMs: readDurationMs(
              hubAnalyticsParsed.pruneInterval,
              defaults.analytics.pruneIntervalMs
            ),
          },
          sparks: {
            retentionDays: readRetentionDays(
              hubSparksParsed.retention,
              defaults.sparks.retentionDays
            ),
            pruneIntervalMs: readDurationMs(
              hubSparksParsed.pruneInterval,
              defaults.sparks.pruneIntervalMs
            ),
          },
          workflows: {
            retentionDays: readRetentionDays(
              hubWorkflowsParsed.retention,
              defaults.workflows.retentionDays
            ),
            pruneIntervalMs: readDurationMs(
              hubWorkflowsParsed.pruneInterval,
              defaults.workflows.pruneIntervalMs
            ),
          },
          shutdown: {
            gracePeriodMs: readDurationMs(
              hubShutdownParsed.gracePeriod,
              defaults.shutdown.gracePeriodMs
            ),
          },
        },
        plugins: this.#parsePlugins(parsed.plugins),
        rules: z.array(z.custom<RuleEntry>()).catch([]).parse(parsed.rules),
        schedules: z.array(z.custom<ScheduleEntry>()).catch([]).parse(parsed.schedules),
        defaultRegistry:
          typeof parsed.registry === 'string' ? trimUrl(parsed.registry) : defaultRegistry(),
        npmRegistries:
          parsed.npmRegistries === undefined
            ? {}
            : Object.fromEntries(
                Object.entries(NpmRegistriesSchema.parse(parsed.npmRegistries)).map(
                  ([scope, url]) => [scope, trimUrl(url)]
                )
              ),
        searchStores:
          parsed.searchStores === undefined
            ? defaultSearchStores()
            : SearchStoresSchema.parse(parsed.searchStores).map(trimUrl),
        registries: resolveRegistries(operatorRegistries),
      };

      this.#logger.info('Configuration loaded successfully', {
        configPath: this.configPath,
        pluginCount: this.#config.plugins.length,
        ruleCount: this.#config.rules.length,
        scheduleCount: this.#config.schedules.length,
      });
      return this.#config;
    } catch (err) {
      // Fail closed. The file exists (absence is handled above) but is malformed,
      // so falling back to defaultConfig() would silently bind host 0.0.0.0 with
      // an empty CORS allow-list, discarding the operator's narrowed settings.
      // Refuse to start instead, so the operator fixes the file.
      this.#logger.error(
        'Failed to parse configuration file; refusing to start with insecure defaults',
        { configPath: this.configPath },
        { error: err }
      );
      throw err instanceof Error
        ? err
        : new Error(`Failed to parse configuration file at ${this.configPath}`);
    }
  }

  get(): BrikaConfig {
    if (!this.#config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.#config;
  }

  /**
   * The `/v1` store base URLs the hub actually searches: the runtime-mutable `searchStores` list
   * unioned (de-duped) with any `/v1` stores declared by operator `registries:` entries. Keeping the
   * union out of `searchStores` itself means a registry removed from `registries:` stops being
   * searched (no stale entry baked into the saved file).
   */
  getSearchStores(): string[] {
    return [...new Set([...this.get().searchStores, ...this.#operatorStoreUrls])];
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getBrikaDir(): string {
    return this.brikaDir;
  }

  getSystemDir(): string {
    return this.systemDir;
  }

  /**
   * Save the current config to brika.yml
   */
  async save(config?: BrikaConfig): Promise<void> {
    const configToSave = config ?? this.#config;
    if (!configToSave) {
      throw new Error('No config to save. Call load() first or provide a config.');
    }

    // Convert plugin entries to object format for YAML.
    // Defensive: __secret_* keys are presence indices only — never let a real
    // value leak into YAML if a future caller forgets to route through SecretStore.
    const pluginsObj: Record<string, { version: string; config?: Record<string, unknown> }> = {};
    for (const entry of configToSave.plugins) {
      const sanitizedConfig = sanitizeSecretSentinels(entry.config);
      pluginsObj[entry.name] = {
        version: entry.version,
        ...(sanitizedConfig && Object.keys(sanitizedConfig).length > 0
          ? { config: sanitizedConfig }
          : {}),
      };
    }

    const hubYaml = hubToYaml(configToSave.hub);
    const configStructure = {
      hub: hubYaml,
      plugins: pluginsObj,
      rules: configToSave.rules,
      schedules: configToSave.schedules,
      registry: configToSave.defaultRegistry,
      npmRegistries: configToSave.npmRegistries,
      searchStores: configToSave.searchStores,
    };

    const file = Bun.file(this.configPath);
    let doc: YAML.Document;

    if (await file.exists()) {
      const content = await file.text();
      try {
        doc = YAML.parseDocument(content);
        doc.set('hub', hubYaml);
        doc.set('plugins', pluginsObj);
        doc.set('rules', configToSave.rules);
        doc.set('schedules', configToSave.schedules);
        doc.set('registry', configToSave.defaultRegistry);
        // Drop the pre-rename key so an upgraded file isn't left with both.
        doc.delete('defaultRegistry');
        doc.set('npmRegistries', configToSave.npmRegistries);
        doc.set('searchStores', configToSave.searchStores);
      } catch {
        doc = new YAML.Document(configStructure);
      }
    } else {
      doc = new YAML.Document(configStructure);
    }

    await Bun.write(this.configPath, doc.toString());

    if (config) {
      this.#config = config;
    }

    this.#logger.info('Configuration saved successfully', {
      configPath: this.configPath,
      pluginCount: configToSave.plugins.length,
    });
  }

  /**
   * Add a plugin to the plugins list and save config
   */
  async addPlugin(name: string, version: string): Promise<void> {
    const config = this.get();
    const existing = config.plugins.find((p) => p.name === name);

    if (existing) {
      if (existing.version !== version) {
        existing.version = version;
        await this.save(config);
      }
      return;
    }

    config.plugins.push({ name, version });
    await this.save(config);
  }

  /**
   * Remove a plugin from the plugins list and save config
   */
  async removePlugin(name: string): Promise<void> {
    const config = this.get();
    const initialLength = config.plugins.length;
    config.plugins = config.plugins.filter((p) => p.name !== name);

    if (config.plugins.length !== initialLength) {
      await this.save(config);
    }
  }

  /**
   * Set (add or replace) a scope's npm registry for install routing, and save. Takes effect in the
   * plugins-dir `.npmrc` on the next registry init. The URL is normalized (trailing slash dropped).
   */
  async setNpmRegistry(scope: string, url: string): Promise<void> {
    const config = this.get();
    const normalized = trimUrl(url);
    if (config.npmRegistries[scope] === normalized) {
      return;
    }
    config.npmRegistries = { ...config.npmRegistries, [scope]: normalized };
    await this.save(config);
  }

  /** Remove a scope's npm registry and save. No-op if the scope is not mapped. */
  async removeNpmRegistry(scope: string): Promise<void> {
    const config = this.get();
    if (!(scope in config.npmRegistries)) {
      return;
    }
    const { [scope]: _removed, ...rest } = config.npmRegistries;
    config.npmRegistries = rest;
    await this.save(config);
  }

  /** Add a `/v1` search store (de-duped, normalized) and save. No-op if already present. */
  async addSearchStore(url: string): Promise<void> {
    const config = this.get();
    const normalized = trimUrl(url);
    if (config.searchStores.includes(normalized)) {
      return;
    }
    config.searchStores = [...config.searchStores, normalized];
    await this.save(config);
  }

  /** Remove a `/v1` search store and save. No-op if absent. */
  async removeSearchStore(url: string): Promise<void> {
    const config = this.get();
    const normalized = trimUrl(url);
    if (!config.searchStores.includes(normalized)) {
      return;
    }
    config.searchStores = config.searchStores.filter((store) => store !== normalized);
    await this.save(config);
  }

  /** Replace the whole registry configuration (install map and/or search stores) and save. */
  async setRegistries(registries: {
    npmRegistries?: Record<string, string>;
    searchStores?: string[];
  }): Promise<void> {
    const config = this.get();
    if (registries.npmRegistries) {
      config.npmRegistries = Object.fromEntries(
        Object.entries(registries.npmRegistries).map(([scope, url]) => [scope, trimUrl(url)])
      );
    }
    if (registries.searchStores) {
      config.searchStores = registries.searchStores.map(trimUrl);
    }
    await this.save(config);
  }

  /**
   * Get plugin config by name
   */
  getPluginConfig(name: string): Record<string, unknown> | undefined {
    return this.get().plugins.find((p) => p.name === name)?.config;
  }

  /**
   * Set plugin config and save
   */
  async setPluginConfig(name: string, pluginConfig: Record<string, unknown>): Promise<void> {
    const config = this.get();
    const plugin = config.plugins.find((p) => p.name === name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }
    plugin.config = pluginConfig;
    await this.save(config);
  }

  /**
   * Resolve plugin entry to actual package name and root directory.
   */
  async resolvePluginEntry(entry: PluginEntry): Promise<{ name: string; rootDirectory: string }> {
    const { name, version } = entry;

    // workspace:* → find package by name in ./plugins/
    if (version === 'workspace:*') {
      const result = await this.#findWorkspacePackage(name);
      if (result) {
        return result;
      }
      throw new Error(`Workspace package not found: ${name}`);
    }

    // workspace:./path → explicit local path
    if (version.startsWith('workspace:')) {
      const workspaceRoot = await this.#findWorkspaceRoot();
      const relativePath = version.slice('workspace:'.length);
      const pluginDir = relativePath.startsWith('./')
        ? `${workspaceRoot}/${relativePath.slice(2)}`
        : `${workspaceRoot}/${relativePath}`;

      const result = await this.#resolveWorkspacePackage(pluginDir, name);
      if (result) {
        return result;
      }
      throw new Error(`Workspace package not found at: ${pluginDir}`);
    }

    // file: specifier → direct file path
    if (version.startsWith('file:')) {
      return { name, rootDirectory: version.slice('file:'.length) };
    }

    // npm package - check in registry's plugins directory
    const registryPluginPath = `${this.systemDir}/plugins/node_modules/${name}`;
    const pkgJsonPath = `${registryPluginPath}/package.json`;
    if (await Bun.file(pkgJsonPath).exists()) {
      return { name, rootDirectory: registryPluginPath };
    }

    throw new Error(`Cannot resolve npm package: ${name}. Install via registry first.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate the `hub.corsAllowlist` field with zod. Invalid entries (bad
   * scheme, path-bearing values, non-arrays) are rejected and the allowlist
   * falls back to empty — a malformed entry must never silently widen CORS.
   * Valid entries are normalised to their canonical `URL().origin` form.
   */
  #parseCorsAllowlist(raw: unknown): string[] {
    const result = safeParseCorsAllowlist(raw);
    if ('origins' in result) {
      return result.origins;
    }
    this.#logger.warn('Invalid hub.corsAllowlist in config — ignoring it', {
      configPath: this.configPath,
      issues: result.issues,
    });
    return [];
  }

  #parsePlugins(plugins: unknown): PluginEntry[] {
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
      return [];
    }

    return Object.entries(
      plugins as Record<string, { version: string; config?: Record<string, unknown> }>
    ).map(([name, entry]) => ({
      name,
      version: entry.version,
      config: entry.config,
    }));
  }

  async #findWorkspacePackage(
    packageName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const workspaceRoot = await this.#findWorkspaceRoot();
    const pluginsDir = `${workspaceRoot}/plugins`;

    try {
      const glob = new Bun.Glob('*/package.json');
      for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
        const pkgPath = `${pluginsDir}/${path}`;
        try {
          const pkg = await Bun.file(pkgPath).json();
          if (pkg.name === packageName) {
            return { name: pkg.name, rootDirectory: pkgPath.replace('/package.json', '') };
          }
        } catch {
          // Skip invalid package.json
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  }

  getWorkspaceRoot(): Promise<string> {
    return this.#findWorkspaceRoot();
  }

  async #findWorkspaceRoot(): Promise<string> {
    let dir = this.rootDir;
    const { dirname } = await import('node:path');

    for (let i = 0; i < 5; i++) {
      const bunLockPath = `${dir}/bun.lock`;
      if (await Bun.file(bunLockPath).exists()) {
        try {
          const pkg = await Bun.file(`${dir}/package.json`).json();
          if (pkg.workspaces) {
            return dir;
          }
        } catch {
          // Continue
        }
      }

      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    return this.rootDir;
  }

  async #resolveWorkspacePackage(
    pluginDir: string,
    fallbackName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const pkgPath = `${pluginDir}/package.json`;
    if (!(await Bun.file(pkgPath).exists())) {
      return null;
    }

    const pkg = await Bun.file(pkgPath).json();
    return { name: pkg.name || fallbackName, rootDirectory: pluginDir };
  }
}
