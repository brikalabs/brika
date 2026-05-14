/**
 * Pipe log lines to the platform clipboard via `pbcopy` (macOS),
 * `wl-copy` / `xclip` (Linux), or `clip` (Windows). Returns true on
 * success, false if no clipboard tool was reachable.
 */

import { stripAnsiForFile } from './ansi';

export async function copyLogsToClipboard(lines: ReadonlyArray<string>): Promise<boolean> {
  const cmd = clipboardCopyCmd();
  if (!cmd) {
    return false;
  }
  try {
    const proc = Bun.spawn(cmd, {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    proc.stdin?.write(lines.map(stripAnsiForFile).join('\n'));
    proc.stdin?.end();
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

function clipboardCopyCmd(): string[] | null {
  if (process.platform === 'darwin') {
    return ['pbcopy'];
  }
  if (process.platform === 'win32') {
    return ['clip'];
  }
  // Linux: prefer wl-copy (Wayland) when WAYLAND_DISPLAY is set, else xclip.
  if (process.env.WAYLAND_DISPLAY) {
    return ['wl-copy'];
  }
  return ['xclip', '-selection', 'clipboard'];
}
