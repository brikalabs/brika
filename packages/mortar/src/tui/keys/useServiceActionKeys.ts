/**
 * Service-action keybinds: things you do to the focused service.
 *
 *   r   restart it
 *   R   restart every service (whole tree)
 *   o   open its URL in the default browser
 *   s   save its log buffer to .mortar-logs/<id>-<ts>.log
 *   c   copy its log buffer to the system clipboard
 */

import { copyLogsToClipboard, openInBrowser, saveLogsToFile, useShortcut } from '@brika/tui';
import { serviceUrl } from '../../config';
import { useMortar } from '../useMortar';

export function useServiceActionKeys(enabled: boolean): void {
  const { supervisor, focus, toast } = useMortar();
  const focused = focus.focused;

  useShortcut(
    'r',
    () => {
      if (focused) {
        void supervisor.restart(focused.spec.id);
      }
    },
    enabled
  );

  useShortcut(
    'R',
    () => {
      toast.showToast('Restarting all services…');
      void supervisor.restartAll();
    },
    enabled
  );

  useShortcut(
    'o',
    () => {
      const url = focused ? serviceUrl(focused.spec, focused.detectedPort) : null;
      if (url) {
        openInBrowser(url);
      }
    },
    enabled
  );

  useShortcut(
    's',
    () => {
      if (!focused) {
        return;
      }
      const lineCount = focused.logs.length;
      toast.showToast(`Saving ${lineCount} lines…`);
      void saveLogsToFile(focused.spec.id, focused.logs, supervisor.root).then(
        (path) => toast.showToast(`Saved ${lineCount} lines → ${path}`),
        (err) => toast.showToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
      );
    },
    enabled
  );

  useShortcut(
    'c',
    () => {
      if (!focused) {
        return;
      }
      const lineCount = focused.logs.length;
      toast.showToast(`Copying ${lineCount} lines…`);
      void copyLogsToClipboard(focused.logs).then((ok) =>
        toast.showToast(
          ok
            ? `Copied ${lineCount} lines to clipboard`
            : 'Copy failed — no clipboard tool found (install pbcopy/xclip/wl-copy)'
        )
      );
    },
    enabled
  );
}
