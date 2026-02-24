import pc from 'picocolors';
import { defineCommand } from '../command';
import { CliError } from '../errors';
import { checkPid, removePidFile } from '../utils/pid';

export default defineCommand({
  name: 'stop',
  description: 'Stop a running hub',
  details: 'Sends SIGTERM to the running Brika hub process in the current directory.',
  examples: ['brika stop'],
  async handler() {
    const status = await checkPid();
    if (status.state === 'stopped') {
      throw new CliError(`${pc.red('Not running')} — no PID file found in this directory`);
    }
    if (status.state === 'stale') {
      console.error(
        `${pc.yellow('Not running')} — stale PID file (process ${status.pid} not found)`
      );
      await removePidFile();
      return;
    }
    process.kill(status.pid, 'SIGTERM');
    console.log(`${pc.green('Stopped')} — sent SIGTERM to PID ${pc.dim(String(status.pid))}`);
  },
});
