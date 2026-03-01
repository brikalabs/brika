import pc from 'picocolors';
import { defineCommand } from '../command';
import { checkPid, removePidFile } from '../utils/pid';

export default defineCommand({
  name: 'status',
  description: 'Show whether the hub is running',
  examples: [
    'brika status',
  ],
  async handler() {
    const status = await checkPid();
    switch (status.state) {
      case 'running': {
        const pidLabel = pc.dim(`PID ${status.pid}`);
        console.log(`brika  ${pc.green('running')}  ${pidLabel}`);
        break;
      }
      case 'stale': {
        const stalePidLabel = pc.dim(`stale PID ${status.pid}`);
        console.log(`brika  ${pc.yellow('stopped')}  ${stalePidLabel}`);
        await removePidFile();
        break;
      }
      case 'stopped':
        console.log(`brika  ${pc.yellow('stopped')}`);
        break;
    }
  },
});
