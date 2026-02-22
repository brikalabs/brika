import pc from 'picocolors';
import { defineCommand } from '../command';
import { checkPid, removePidFile } from '../utils/pid';

export default defineCommand({
  name: 'status',
  description: 'Show whether the hub is running',
  examples: ['brika status'],
  async handler() {
    const status = await checkPid();
    switch (status.state) {
      case 'running':
        console.log(`brika  ${pc.green('running')}  ${pc.dim('PID ' + status.pid)}`);
        break;
      case 'stale':
        console.log(`brika  ${pc.yellow('stopped')}  ${pc.dim('stale PID ' + status.pid)}`);
        await removePidFile();
        break;
      case 'stopped':
        console.log(`brika  ${pc.yellow('stopped')}`);
        break;
    }
  },
});
