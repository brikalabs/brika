#!/usr/bin/env bun

/**
 * mortar — local dev stack orchestrator.
 *
 * The system itself is generic: any repo with multiple long-running
 * dev processes (BE + FE + workers, etc.) can drop in a `mortar.yml`
 * and use this binary. Ships in the Brika monorepo for now; the
 * default YAML written on first run is the Brika stack, but it's
 * just an example — edit freely.
 *
 * Pipeline:
 *   1. Resolve `mortar.yml` by walking up from cwd (vite-style) or
 *      from `--config <path>`; first-run writes the example here.
 *   2. Build a Supervisor that spawns each service from the directory
 *      containing the resolved file.
 *   3. Render the TUI (or `--no-tui` interleaved log mode for CI).
 *
 * Service topology lives ENTIRELY in the YAML — see `config.ts` for
 * the schema and the inline default.
 */

import { dirname, join, resolve } from 'node:path';
import { createCli, defineCommand } from '@brika/cli';
import { runTui } from '@brika/cli/tui';
import pc from 'picocolors';
import React from 'react';
import { configExists, loadConfig, type ResolvedConfig, saveDefaultConfig } from './config';
import { writeDefaultAndAnnounce } from './config/prompts';
import { SHUTDOWN_GRACE_MS } from './constants';
import { Supervisor } from './supervisor';
import { reapStaleRun } from './supervisor/run-state';
import { App } from './tui/App';

const startCommand = defineCommand({
  name: 'start',
  description: 'Start the stack defined in mortar.yml',
  examples: ['mortar', 'mortar start --no-tui', 'mortar start --config path/to/mortar.yml'],
  options: {
    'no-tui': {
      type: 'boolean',
      description: 'Plain interleaved [svc] log mode instead of the ink TUI',
      default: false,
    },
    config: {
      type: 'string',
      short: 'c',
      description: 'Path to a specific mortar.yml (skips the upward walk from cwd)',
    },
  },
  async handler({ values }) {
    const cfg = await resolveAndLoad(values.config);
    await runStack(cfg, { plain: values.noTui });
  },
});

const initCommand = defineCommand({
  name: 'init',
  description: 'Write the default mortar.yml in the current directory',
  async handler() {
    const path = await saveDefaultConfig();
    process.stdout.write(`${pc.green('✓')} wrote ${pc.cyan(path)}\n`);
  },
});

createCli({ name: 'mortar', defaultCommand: 'start' })
  .addCommand(startCommand)
  .addCommand(initCommand)
  .addHelp()
  .run();

/**
 * Load the config from either an explicit `--config <path>` or by
 * walking up from cwd. On a cold first run with no explicit path,
 * write the default in cwd and load it back.
 */
async function resolveAndLoad(explicitPath: string | undefined): Promise<ResolvedConfig> {
  if (explicitPath) {
    const abs = resolve(explicitPath);
    return loadConfig(dirname(abs));
  }
  if (!configExists()) {
    await writeDefaultAndAnnounce();
  }
  return loadConfig();
}

async function runStack(resolved: ResolvedConfig, { plain }: { plain: boolean }): Promise<void> {
  // Recover from a previous session that died without running shutdown()
  // (kill -9, runtime crash, terminal hard-close). Children are spawned
  // detached, so they survive ANY unclean mortar death; the run-state
  // file is how the next session finds and reaps them.
  const previous = await reapStaleRun(resolved.root);
  if (previous.kind === 'active') {
    console.error(
      `${pc.red('✗')} another mortar session (pid ${previous.mortarPid}) is already running this stack`
    );
    process.exit(1);
  }
  if (previous.kind === 'reaped' && previous.reaped > 0) {
    process.stdout.write(
      `${pc.yellow('⚠')} reaped ${previous.reaped} orphaned service(s) from a previous mortar run\n`
    );
  }

  spawnSentinel(resolved.root);

  const supervisor = new Supervisor(resolved.config.services, { projectRoot: resolved.root });

  const shutdown = (): void => {
    void supervisor.shutdown().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  // SIGHUP: terminal/pane closed, ssh session dropped. Without this the
  // detached children (which do NOT receive the terminal's SIGHUP) all
  // outlive mortar as orphans.
  process.once('SIGHUP', shutdown);

  // Children are spawned detached (process-group leaders), so a mortar crash
  // that skips shutdown() would orphan the WHOLE stack (hub + its plugins).
  // Tear the tree down before dying, whatever the error was.
  const crash = (error: unknown): void => {
    console.error('[mortar] fatal:', error);
    void supervisor.shutdown().then(() => process.exit(1));
  };
  process.once('uncaughtException', crash);
  process.once('unhandledRejection', crash);

  // Last resort, runs even when an exit path skipped the async
  // shutdown(): synchronously SIGKILL each child's process group.
  // (`process.on('exit')` handlers must not await.)
  process.on('exit', () => {
    for (const pid of supervisor.livePids()) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
    }
  });

  if (plain) {
    await runPlain(supervisor, resolved);
    return;
  }

  // `exitOnCtrlC: false` so App can call supervisor.shutdown() FIRST,
  // then exit the ink tree from its quit path (q / Ctrl+C).
  await runTui(
    React.createElement(App, {
      supervisor,
      onQuit: () => void supervisor.shutdown(),
    }),
    { exitOnCtrlC: false }
  );
}

/**
 * Spawn the per-session orphan sentinel: a detached `/bin/sh` loop that
 * polls `kill -0 <our pid>` once a second and, when mortar disappears,
 * waits out the shutdown grace period and execs `sentinel.ts` to reap
 * whatever the run-state file still records.
 *
 * This is the only layer that catches an UNCLEAN mortar death (kill -9,
 * runtime crash, terminal hard-close) within seconds; the signal
 * handlers above need mortar alive, and the start-time reaper only runs
 * at the NEXT `mortar start`. A shell loop (not a Bun process) keeps
 * the resident cost at ~1 MB; positional `$1..$5` args dodge any
 * quoting of paths. Own process group + ignored stdio so it survives
 * the terminal and every signal aimed at mortar's group; it self-exits
 * after one shot. On a clean shutdown the state file is already gone
 * and the reap is a no-op.
 */
function spawnSentinel(root: string): void {
  if (process.platform === 'win32') {
    return;
  }
  const sentinel = join(import.meta.dir, 'supervisor', 'sentinel.ts');
  const graceSeconds = Math.ceil(SHUTDOWN_GRACE_MS / 1000) + 2;
  const proc = Bun.spawn(
    [
      '/bin/sh',
      '-c',
      'while kill -0 "$1" 2>/dev/null; do sleep 1; done; sleep "$2"; exec "$3" "$4" "$5"',
      'mortar-sentinel',
      String(process.pid),
      String(graceSeconds),
      process.execPath,
      sentinel,
      root,
    ],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore', detached: true }
  );
  proc.unref();
}

async function runPlain(supervisor: Supervisor, resolved: ResolvedConfig): Promise<void> {
  const colors = ['cyan', 'magenta', 'yellow', 'green', 'blue'] as const;
  const colorFor = new Map<string, (s: string) => string>();
  resolved.config.services.forEach((svc, i) => {
    const color = colors[i % colors.length] ?? 'cyan';
    colorFor.set(svc.id, pc[color]);
  });

  const printed = new Map<string, number>();
  for (const svc of resolved.config.services) {
    printed.set(svc.id, 0);
  }

  supervisor.subscribe((event) => {
    if (event.kind !== 'state') {
      return;
    }
    const svc = supervisor.get(event.serviceId);
    if (!svc) {
      return;
    }
    const seen = printed.get(svc.spec.id) ?? 0;
    const next = svc.logs.slice(seen);
    if (next.length > 0) {
      const tag = (colorFor.get(svc.spec.id) ?? pc.cyan)(`[${svc.spec.id}]`);
      for (const line of next) {
        process.stdout.write(`${tag} ${line}\n`);
      }
      printed.set(svc.spec.id, svc.logs.length);
    }
    if (svc.status.kind === 'healthy') {
      process.stdout.write(`${pc.green('✓')} ${svc.spec.label} healthy\n`);
    } else if (svc.status.kind === 'crashed') {
      process.stdout.write(`${pc.red('✗')} ${svc.spec.label} crashed: ${svc.status.reason}\n`);
    }
  });

  supervisor.start();
  await new Promise<never>(() => {
    // intentional: SIGINT handler unwinds the process
  });
}
