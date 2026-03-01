import { $ } from 'bun';

export interface ProcessMetrics {
  cpu: number; // percentage (0-100)
  memory: number; // bytes (RSS)
  ts: number; // timestamp
}

/**
 * Collects CPU and memory metrics for a process using the native `ps` command.
 * Works on macOS and Linux.
 */
export async function getProcessMetrics(pid: number): Promise<ProcessMetrics | null> {
  try {
    const result = await $`ps -p ${pid} -o %cpu=,rss=`.quiet();
    const output = result.text().trim();
    if (!output) {
      return null;
    }

    const [cpuStr, rssStr] = output.split(/\s+/);
    const cpu = Number.parseFloat(cpuStr);
    const rss = Number.parseInt(rssStr, 10);

    if (Number.isNaN(cpu) || Number.isNaN(rss)) {
      return null;
    }

    return {
      cpu,
      memory: rss * 1024, // RSS is in KB, convert to bytes
      ts: Date.now(),
    };
  } catch {
    return null;
  }
}
