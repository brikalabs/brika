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

import { dirname, resolve } from 'node:path';
import { createCli, defineCommand } from '@brika/cli';
import { runTui } from '@brika/cli/tui';
import pc from 'picocolors';
import React from 'react';
import { configExists, loadConfig, type ResolvedConfig, saveDefaultConfig } from './config';
import { writeDefaultAndAnnounce } from './config/prompts';
import { Supervisor } from './supervisor';
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
  const supervisor = new Supervisor(resolved.config.services, { projectRoot: resolved.root });

  const shutdown = (): void => {
    void supervisor.shutdown().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  // Children are spawned detached (process-group leaders), so a mortar crash
  // that skips shutdown() would orphan the WHOLE stack (hub + its plugins).
  // Tear the tree down before dying, whatever the error was.
  const crash = (error: unknown): void => {
    console.error('[mortar] fatal:', error);
    void supervisor.shutdown().then(() => process.exit(1));
  };
  process.once('uncaughtException', crash);
  process.once('unhandledRejection', crash);

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
