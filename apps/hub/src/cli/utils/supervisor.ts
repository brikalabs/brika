import pc from 'picocolors';
import { hubUrl } from './hub-client';
import { openBrowser } from './open';
import { claimPidFile, removePidFile } from './pid';
import { RESTART_CODE, spawnDetached, spawnHub } from './runtime';

export function startBackground(open = false): never {
  const { pid } = spawnDetached(['start', '--foreground']);
  const pidLabel = pc.dim(`PID ${pid}`);
  console.log(`${pc.green('Started')} — hub running in background  ${pidLabel}`);
  console.log(pc.dim(`  Stop with: brika stop`));
  if (open) {
    openBrowser(hubUrl());
  }
  process.exit(0);
}

export async function runSupervisor(open = false): Promise<void> {
  const existing = await claimPidFile();
  if (existing !== null) {
    console.error(
      `${pc.red('Error:')} Brika is already running in this directory (PID ${existing}).\n` +
        `  Run ${pc.bold('brika stop')} to stop it first.`
    );
    process.exit(1);
  }

  const env = {
    ...process.env,
    BRIKA_SUPERVISOR_PID: String(process.pid),
  };

  let child: ReturnType<typeof Bun.spawn> | null = null;
  let pendingRestart = false;

  process.on('SIGUSR1', () => {
    pendingRestart = true;
    child?.kill('SIGTERM');
  });
  process.on('SIGTERM', () => child?.kill('SIGTERM'));
  process.on('SIGINT', () => child?.kill('SIGINT'));

  child = spawnHub(['start', '--foreground'], env);
  if (open) {
    openBrowser(hubUrl());
  }

  while (true) {
    const code = await child.exited;
    const shouldRestart = code === RESTART_CODE || pendingRestart;
    pendingRestart = false;
    if (!shouldRestart) {
      break;
    }
    console.log(pc.dim('  Restarting hub...'));
    child = spawnHub(['start', '--foreground'], env);
  }

  await removePidFile();
}
