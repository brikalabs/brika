/**
 * Dev-only fake-update layer.
 *
 * Convention: any file named `*.mock.ts` is stripped from the production
 * binary by the `stub-mock-files` Bun.build plugin (see
 * `apps/build/src/plugins/stub-mock-files.ts`). The dev runtime keeps the real
 * file. This means: it's safe to write rich mocks here without bloating
 * the shipped binary or worrying about an env-misconfiguration leaking
 * synthetic data to a real user.
 *
 * Wired via DI: the bootstrap plugin (`runtime/bootstrap/plugins/updates.ts`)
 * dynamically imports this module when `BRIKA_DEV_FAKE_UPDATE` is set
 * and registers {@link MockUpdateProvider} against the {@link UpdateProvider}
 * token. The rest of the hub injects the abstraction and is unaware
 * which provider is bound.
 *
 * Scenarios:
 *   - `available`           → updateAvailable: true, latest = current+patch1
 *   - `dev-build`           → devBuild: true, current ahead of channel
 *   - `channel-mismatch`    → channelMismatch: true, current is a -canary tag
 *   - `up-to-date`          → no update; exercises the "nothing to do" UI
 *   - `apply-error`         → check passes; apply emits an error mid-stream
 *   - `force-real-install`  → hybrid: check is mocked to show the *real*
 *                              latest GitHub release with `updateAvailable: true`,
 *                              and applying delegates to the **real**
 *                              `GitHubUpdateProvider` with `force: true`.
 *                              Use this to exercise the actual binary swap
 *                              pipeline (download / verify / extract / rename
 *                              `process.execPath`) against a live release —
 *                              nothing else in the codebase forces a real
 *                              install when you're already current.
 *
 * Override the per-phase apply delay with `BRIKA_DEV_FAKE_UPDATE_DELAY_MS`
 * (default 400, clamped to [0, 5000]).
 */

import { injectable } from '@brika/di';
import { hub } from '@/hub';
import { buildInfo } from '@/runtime/http/routes/status';
import {
  DEFAULT_CHANNEL_ID,
  type UpdateChannelId,
} from '@/runtime/updates/channels';
import {
  type ApplyResult,
  GitHubUpdateProvider,
  type ProviderApplyOptions,
  UpdateProvider,
} from '@/runtime/updates/update-provider';
import type { UpdateInfo, UpdatePhase } from '@/updater';

export const MOCK_ENV_VAR = 'BRIKA_DEV_FAKE_UPDATE';
export const MOCK_DELAY_ENV_VAR = 'BRIKA_DEV_FAKE_UPDATE_DELAY_MS';

export const MOCK_SCENARIOS = [
  'available',
  'dev-build',
  'channel-mismatch',
  'up-to-date',
  'apply-error',
  'force-real-install',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

function isScenario(value: string): value is MockScenario {
  return (MOCK_SCENARIOS as ReadonlyArray<string>).includes(value);
}

/**
 * Resolve the active scenario from the env, or `null` when none is set.
 * Trimmed + case-insensitive. Unknown values resolve to `null` so a
 * typo (`BRIKA_DEV_FAKE_UPDATE=avaliable`) doesn't silently hide the
 * real updater.
 */
export function getActiveScenario(env: NodeJS.ProcessEnv = process.env): MockScenario | null {
  const raw = env[MOCK_ENV_VAR]?.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  return isScenario(raw) ? raw : null;
}

/**
 * Per-phase delay for the synthetic apply stream. Clamped to a sane
 * range so a misconfigured env var can't hang the hub.
 */
function getDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[MOCK_DELAY_ENV_VAR];
  if (!raw) {
    return 400;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 400;
  }
  return Math.min(parsed, 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario shape table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-scenario deltas applied on top of a base "everything is fine"
 * `UpdateInfo`. Pulled out of a switch into a static record so the
 * shape of each scenario is grep-able in one place.
 */
interface ScenarioPatch {
  /** Whether this scenario surfaces a newer release. */
  updateAvailable?: boolean;
  /** Whether the local build is ahead of the channel's latest. */
  devBuild?: boolean;
  /** Whether we're on a pre-release tag while the channel is stable. */
  channelMismatch?: boolean;
  /**
   * `'next-patch'`: latestVersion = currentPatch + 1.
   * `'current'`:    latestVersion == currentVersion.
   * `'previous-patch'`: channel reports a lower version (dev-build / channel-mismatch).
   */
  latest: 'next-patch' | 'current' | 'previous-patch';
  /**
   * Override currentVersion. `'next-patch'` simulates "local is one
   * patch ahead of the channel"; `'next-patch-canary'` adds a
   * pre-release tag for the channel-mismatch case.
   */
  current?: 'next-patch' | 'next-patch-canary';
}

const SCENARIO_PATCHES: Record<MockScenario, ScenarioPatch> = {
  available: {
    updateAvailable: true,
    latest: 'next-patch',
  },
  'dev-build': {
    devBuild: true,
    current: 'next-patch',
    latest: 'previous-patch',
  },
  'channel-mismatch': {
    channelMismatch: true,
    current: 'next-patch-canary',
    latest: 'previous-patch',
  },
  'up-to-date': {
    latest: 'current',
  },
  'apply-error': {
    // For check purposes, apply-error looks identical to `available` —
    // the divergence happens during `apply()`, not `check()`.
    updateAvailable: true,
    latest: 'next-patch',
  },
  'force-real-install': {
    // Never read: the MockUpdateProvider routes `force-real-install`
    // straight through to GitHubUpdateProvider for both check and apply.
    // The entry exists only to satisfy the Record<MockScenario, …> type.
    latest: 'current',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Fake UpdateInfo construction
// ─────────────────────────────────────────────────────────────────────────────

interface BuildOptions {
  scenario: MockScenario;
  channel: UpdateChannelId;
}

/**
 * Build the synthetic `UpdateInfo` for the given scenario. Versions
 * are derived from the real local `hub.version` so the rendered diff
 * is plausible (e.g. `0.3.1 → 0.3.2`).
 */
export function buildFakeUpdateInfo({ scenario, channel }: BuildOptions): UpdateInfo {
  const realVersion = hub.version;
  const nextPatch = bumpPatch(realVersion);
  const patch = SCENARIO_PATCHES[scenario];

  const currentVersion = resolveCurrent(realVersion, nextPatch, patch.current);
  const latestVersion = resolveLatest(realVersion, nextPatch, patch.latest);

  return {
    currentVersion,
    latestVersion,
    updateAvailable: patch.updateAvailable ?? false,
    devBuild: patch.devBuild ?? false,
    channelMismatch: patch.channelMismatch ?? false,
    releaseUrl: `https://github.com/brikalabs/brika/releases/tag/v${latestVersion}`,
    releaseNotes: synthesizeReleaseNotes(latestVersion, scenario),
    publishedAt: new Date().toISOString(),
    releaseCommit: `${'deadbee'.repeat(5)}f`,
    currentCommit: buildInfo.commitFull,
    assetName: `brika-${process.platform}-${process.arch}.tar.gz`,
    assetSize: 12 * 1024 * 1024 + 345 * 1024,
    channel,
  };
}

function resolveCurrent(
  real: string,
  nextPatch: string,
  override: ScenarioPatch['current']
): string {
  if (override === 'next-patch') {
    return nextPatch;
  }
  if (override === 'next-patch-canary') {
    return `${nextPatch}-canary.20260520`;
  }
  return real;
}

function resolveLatest(real: string, nextPatch: string, kind: ScenarioPatch['latest']): string {
  switch (kind) {
    case 'next-patch':
      return nextPatch;
    case 'previous-patch':
      return real;
    case 'current':
      return real;
  }
}

function synthesizeReleaseNotes(version: string, scenario: MockScenario): string {
  return [
    `### Synthetic release notes for v${version}`,
    '',
    `- This is a fake release surfaced by ${MOCK_ENV_VAR}=${scenario}.`,
    '- No real binary was published.',
  ].join('\n');
}

/**
 * Bump a `x.y.z` version's patch component by one. Falls back to
 * `0.0.1` for unparseable inputs — throwing here would brick the dev
 * hub's startup, which is the wrong tradeoff for a mock.
 */
function bumpPatch(version: string): string {
  const stripped = version.replace(/^v/, '');
  const dashIdx = stripped.search(/[-+]/);
  const base = dashIdx === -1 ? stripped : stripped.slice(0, dashIdx);
  const parts = base.split('.');
  if (parts.length < 3) {
    return '0.0.1';
  }
  const [majS, minS, patchS] = parts as [string, string, string];
  const maj = Number.parseInt(majS, 10);
  const min = Number.parseInt(minS, 10);
  const patch = Number.parseInt(patchS, 10);
  if (Number.isNaN(maj) || Number.isNaN(min) || Number.isNaN(patch)) {
    return '0.0.1';
  }
  return `${maj}.${min}.${patch + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake apply stream
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered list of phases the synthetic apply emits. */
const APPLY_PHASES: ReadonlyArray<{ phase: UpdatePhase; message: string }> = [
  { phase: 'checking', message: 'Checking for updates…' },
  { phase: 'downloading', message: 'Downloading new release…' },
  { phase: 'verifying', message: 'Verifying checksum…' },
  { phase: 'extracting', message: 'Extracting archive…' },
  { phase: 'installing', message: 'Installing new binary…' },
  { phase: 'restarting', message: 'Restarting hub…' },
];

/** Phase the `apply-error` scenario fails at — fires the error *instead of* this phase. */
const APPLY_ERROR_PHASE: UpdatePhase = 'extracting';

interface RunFakeApplyOptions {
  scenario: MockScenario;
  onProgress: (event: {
    phase: UpdatePhase | 'error';
    message?: string;
    error?: string;
  }) => void;
  /** Override per-phase delay (test seam). Defaults to env-derived value. */
  delayMs?: number;
  /** Sleep injection point so tests don't need real wall-clock waits. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Stream synthetic SSE-shaped events for an "apply" flow. Resolves once
 * all events have been emitted (or once the synthetic error fires for
 * the `apply-error` scenario).
 */
export async function runFakeApply({
  scenario,
  onProgress,
  delayMs,
  sleep = defaultSleep,
}: RunFakeApplyOptions): Promise<void> {
  const dwell = delayMs ?? getDelayMs();
  for (const event of APPLY_PHASES) {
    // Fire the error in the middle of the stream so the UI gets to
    // render a few phase changes before failure — more realistic than
    // failing on phase 0.
    if (scenario === 'apply-error' && event.phase === APPLY_ERROR_PHASE) {
      onProgress({
        phase: 'error',
        message: 'Synthetic apply error',
        error: `Forced by ${MOCK_ENV_VAR}=apply-error — no real download was attempted.`,
      });
      return;
    }
    onProgress(event);
    await sleep(dwell);
  }
  onProgress({ phase: 'complete', message: 'Update applied (synthetic).' });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner — loud-once startup warning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks which scenarios have already been announced so repeated calls
 * with the same scenario stay quiet, but a scenario *change* (during a
 * hot reload, say) re-announces. Tests reset via {@link _resetBannerForTests}.
 */
const announcedScenarios = new Set<MockScenario>();

export function logMockBannerIfActive(
  log: (msg: string) => void = (m) => console.warn(m),
  env: NodeJS.ProcessEnv = process.env
): void {
  const scenario = getActiveScenario(env);
  if (!scenario || announcedScenarios.has(scenario)) {
    return;
  }
  announcedScenarios.add(scenario);
  const channel = env.BRIKA_UPDATE_CHANNEL ?? DEFAULT_CHANNEL_ID;
  log(
    `[updater] ${MOCK_ENV_VAR} active — scenario=${scenario}, channel=${channel}. ` +
      'No real GitHub call will be made; applying an update will NOT swap the binary. ' +
      `Unset ${MOCK_ENV_VAR} to restore real behaviour.`
  );
}

/** Test-only reset of the banner-once latch. */
export function _resetBannerForTests(): void {
  announcedScenarios.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// MockUpdateProvider — DI binding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `UpdateProvider` implementation that serves synthetic data and a
 * scripted apply stream. Registered by the bootstrap plugin when
 * `BRIKA_DEV_FAKE_UPDATE` is set.
 *
 * If the env var is somehow unset by the time this provider is invoked
 * (race during a hot reload), `check()` and `apply()` fall back to the
 * `up-to-date` shape rather than crashing — the binary should never
 * have reached this code path in that state anyway.
 */
@injectable()
export class MockUpdateProvider extends UpdateProvider {
  /** Singleton-ish: cached on first hybrid call so we don't instantiate per request. */
  #real: GitHubUpdateProvider | null = null;

  #realProvider(): GitHubUpdateProvider {
    if (!this.#real) {
      this.#real = new GitHubUpdateProvider();
    }
    return this.#real;
  }

  async check(channel: UpdateChannelId): Promise<UpdateInfo> {
    const scenario = getActiveScenario() ?? 'up-to-date';
    if (scenario === 'force-real-install') {
      // Real check against GitHub; flip `updateAvailable` on so the UI
      // surfaces an "apply" CTA even when the local hub is already on
      // the latest. The downstream apply call uses `force: true` so the
      // pipeline actually runs.
      const real = await this.#realProvider().check(channel);
      return { ...real, updateAvailable: true };
    }
    return buildFakeUpdateInfo({ scenario, channel });
  }

  async apply(options: ProviderApplyOptions): Promise<ApplyResult> {
    const scenario = getActiveScenario() ?? 'up-to-date';
    const channel = options.channel ?? DEFAULT_CHANNEL_ID;
    if (scenario === 'force-real-install') {
      // Real apply with force=true. This downloads the GitHub asset,
      // verifies the checksum, extracts, and rewrites `process.execPath`
      // — the genuine pipeline, not the scripted SSE stream.
      return this.#realProvider().apply({ ...options, channel, force: true });
    }
    const fake = buildFakeUpdateInfo({ scenario, channel });
    await runFakeApply({
      scenario,
      onProgress: (event) => {
        if (event.phase === 'error') {
          options.onProgress?.('error', event.error ?? event.message ?? 'Update failed');
          return;
        }
        options.onProgress?.(event.phase, event.message ?? event.phase);
      },
    });
    if (scenario === 'apply-error') {
      throw new Error(`Synthetic apply failure (${MOCK_ENV_VAR}=${scenario})`);
    }
    return {
      previousVersion: fake.currentVersion,
      previousCommit: fake.currentCommit,
      newVersion: fake.latestVersion,
      newCommit: fake.releaseCommit,
    };
  }
}
