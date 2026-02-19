/**
 * BRIKA CLI Entry Point
 *
 * Standalone binary CLI using Node's built-in util.parseArgs.
 * Auto-detects bundled assets (bun runtime, UI, locales) next to the binary.
 */

import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { HUB_REPO_URL, hub } from '@/hub';
import { PID_FILE } from '@/runtime/bootstrap/plugins/pid';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detection (bundled assets next to binary)
// ─────────────────────────────────────────────────────────────────────────────

const installDir = dirname(process.execPath);

function detect(relativePath: string): string {
  const fullPath = join(installDir, relativePath);
  return existsSync(fullPath) ? fullPath : '';
}

const bunBinary = detect(process.platform === 'win32' ? 'bun.exe' : 'bun') || 'bun';
const uiDir = detect('ui');

// ─────────────────────────────────────────────────────────────────────────────
// PID file helpers (used by stop / status commands)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the PID of the running hub, or null if not running / no PID file. */
async function readPid(): Promise<number | null> {
  const raw = await readFile(PID_FILE, 'utf8').catch(() => null);
  if (raw === null) return null;
  const pid = Number.parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    port: { type: 'string', short: 'p' },
    host: { type: 'string' },
  },
  allowPositionals: true,
  strict: false, // ignore unknown flags gracefully
});

const command = positionals[0] ?? 'start';

// Short-circuit flags (work with any command or standalone)
if (values.version) {
  console.log(hub.version);
  process.exit(0);
}
if (values.help) {
  showHelp();
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

switch (command) {
  case 'start': {
    // Apply CLI flags as env vars (CLI flags > env vars > config defaults)
    if (typeof values.port === 'string') process.env.BRIKA_PORT = values.port;
    if (typeof values.host === 'string') process.env.BRIKA_HOST = values.host;

    // Auto-configure standalone paths
    process.env.BRIKA_BUN_PATH ??= bunBinary;
    process.env.BRIKA_STATIC_DIR ??= uiDir;

    await import('@/main');
    break;
  }

  case 'stop': {
    const pid = await readPid();
    if (pid === null) {
      console.error(`${pc.red('Not running')} — no PID file found in this directory`);
      process.exit(1);
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`${pc.green('Stopped')} — sent SIGTERM to PID ${pc.dim(String(pid))}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
        console.error(`${pc.yellow('Not running')} — stale PID file (process ${pid} not found)`);
        await rm(PID_FILE, { force: true });
      } else {
        throw e;
      }
    }
    break;
  }

  case 'status': {
    const pid = await readPid();
    if (pid === null) {
      console.log(`brika  ${pc.yellow('stopped')}`);
      break;
    }
    try {
      process.kill(pid, 0); // signal 0 = probe liveness without killing
      console.log(`brika  ${pc.green('running')}  ${pc.dim('PID ' + pid)}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log(`brika  ${pc.yellow('stopped')}  ${pc.dim('stale PID ' + pid)}`);
        await rm(PID_FILE, { force: true });
      } else {
        // EPERM: process exists but belongs to another user — still running
        console.log(`brika  ${pc.green('running')}  ${pc.dim('PID ' + pid)}`);
      }
    }
    break;
  }

  case 'version': {
    const hasBundledBun = bunBinary !== 'bun';
    const bundledBun = hasBundledBun ? pc.green(bunBinary) : pc.yellow('no (using PATH)');
    const versionStr = pc.green('v' + hub.version);
    console.log(`${pc.bold(pc.cyan('brika'))} ${versionStr}`);
    console.log();
    console.log(`  ${pc.dim('Platform:')}  ${process.platform}/${process.arch}`);
    console.log(`  ${pc.dim('Runtime:')}   Bun ${Bun.version}`);
    console.log(`  ${pc.dim('Bundled:')}   ${bundledBun}`);
    console.log(`  ${pc.dim('Install:')}   ${installDir}`);
    break;
  }

  case 'update': {
    const { selfUpdate } = await import('@/updater');
    await selfUpdate();
    break;
  }

  case 'uninstall': {
    const { selfUninstall } = await import('@/uninstaller');
    await selfUninstall();
    break;
  }

  case 'help':
    showHelp();
    break;

  default:
    console.error(`${pc.red('Unknown command:')} ${command}`);
    console.error(`Run ${pc.cyan('brika help')} for usage.`);
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(
    `
${pc.bold(pc.cyan('brika'))} - Build. Run. Integrate. Keep Automating.

${pc.bold('Usage:')}
  brika [command] [flags]

${pc.bold('Commands:')}
  ${pc.green('start')}       Start the Brika hub ${pc.dim('(default)')}
  ${pc.green('stop')}        Stop a running hub in the current directory
  ${pc.green('status')}      Show whether the hub is running
  ${pc.green('version')}     Show version and platform info
  ${pc.green('update')}      Update to the latest version
  ${pc.green('uninstall')}   Remove Brika from this machine
  ${pc.green('help')}        Show this help message

${pc.bold('Flags:')}
  ${pc.green('-p, --port')} <port>   Listen port ${pc.dim('(default: 3001)')}
  ${pc.green('    --host')} <addr>   Listen address ${pc.dim('(default: 127.0.0.1)')}
  ${pc.green('-v, --version')}       Print version number
  ${pc.green('-h, --help')}          Show this help

${pc.bold('Examples:')}
  ${pc.dim('$')} brika                       ${pc.dim('# start with defaults')}
  ${pc.dim('$')} brika start -p 8080         ${pc.dim('# start on port 8080')}
  ${pc.dim('$')} brika start --host 0.0.0.0  ${pc.dim('# listen on all interfaces')}
  ${pc.dim('$')} brika stop                  ${pc.dim('# stop the running hub')}
  ${pc.dim('$')} brika status                ${pc.dim('# check if hub is running')}
  ${pc.dim('$')} brika update                ${pc.dim('# update to latest version')}
  ${pc.dim('$')} brika -v                    ${pc.dim('# print version')}

${pc.dim('v' + hub.version + ' | ' + HUB_REPO_URL)}
`.trim()
  );
}
