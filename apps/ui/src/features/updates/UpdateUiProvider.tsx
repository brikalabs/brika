/**
 * Wires all update-related surfaces together: the floating toast, the
 * release-notes dialog, and the existing UpdateDialog (download/restart).
 *
 * The same ReleaseHistoryDialog serves two purposes:
 *   - auto-opens once after the hub restarts on a new version, with the
 *     just-installed release pre-selected ("what's new" experience);
 *   - opens on demand from the sidebar rail / Settings with the latest
 *     release pre-selected.
 *
 * Mount this once near the root of the authenticated app shell. The
 * <UpdateRail /> reads from the same context to stay in sync with the toast.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useHealth } from '@/features/dashboard/hooks';
import { ReleaseHistoryDialog } from './ReleaseHistoryDialog';
import { UpdateDialog } from './UpdateDialog';
import { UpdateToast } from './UpdateNotification';
import { useUpdateCheck } from './use-update';
import { useDismissedVersion, useLastSeenVersion } from './use-update-state';

interface UpdateUiContextValue {
  readonly hasUpdate: boolean;
  readonly isToastVisible: boolean;
  readonly openUpdateDialog: () => void;
  readonly openHistory: () => void;
  readonly openWhatsNew: () => void;
  readonly snoozeToast: () => void;
  readonly dismissUpdate: () => void;
}

const UpdateUiContext = createContext<UpdateUiContextValue | null>(null);

export function useUpdateUi(): UpdateUiContextValue {
  const ctx = useContext(UpdateUiContext);
  if (!ctx) {
    throw new Error('useUpdateUi must be used inside <UpdateUiProvider>');
  }
  return ctx;
}

interface UpdateUiProviderProps {
  readonly children: ReactNode;
}

export function UpdateUiProvider({ children }: Readonly<UpdateUiProviderProps>) {
  const { data: info } = useUpdateCheck();
  const { data: health } = useHealth();
  const runningVersion = health?.version;

  const { isDismissed, dismiss } = useDismissedVersion(info?.latestVersion);
  const { shouldShow: shouldAutoShowWhatsNew, markSeen } = useLastSeenVersion(runningVersion);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // When auto-opened after upgrade, focus the just-installed release rather
  // than the latest stable release on top of the list.
  const [historyDefault, setHistoryDefault] = useState<string | undefined>(undefined);
  // Session-only: snoozing the toast hides it until the next reload
  const [toastSnoozed, setToastSnoozed] = useState(false);

  // Auto-open the dialog exactly once after a version change.
  useEffect(() => {
    if (shouldAutoShowWhatsNew && runningVersion) {
      setHistoryDefault(runningVersion);
      setHistoryOpen(true);
    }
  }, [shouldAutoShowWhatsNew, runningVersion]);

  // Mark the running version as seen on first install (no upgrade detected) so
  // we don't pop the dialog when the user later upgrades from a fresh install.
  useEffect(() => {
    if (runningVersion && !shouldAutoShowWhatsNew) {
      markSeen(runningVersion);
    }
    // markSeen is stable (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningVersion, shouldAutoShowWhatsNew]);

  const hasUpdate = !!info?.updateAvailable;
  const isToastVisible = hasUpdate && !isDismissed && !toastSnoozed;

  const openUpdateDialog = useCallback(() => setUpdateDialogOpen(true), []);
  const openHistory = useCallback(() => {
    setHistoryDefault(undefined);
    setHistoryOpen(true);
  }, []);
  const openWhatsNew = useCallback(() => {
    if (runningVersion) {
      setHistoryDefault(runningVersion);
    }
    setHistoryOpen(true);
  }, [runningVersion]);
  const snoozeToast = useCallback(() => setToastSnoozed(true), []);

  const handleHistoryOpenChange = useCallback(
    (open: boolean) => {
      setHistoryOpen(open);
      if (!open && runningVersion) {
        markSeen(runningVersion);
      }
    },
    [markSeen, runningVersion]
  );

  const value = useMemo<UpdateUiContextValue>(
    () => ({
      hasUpdate,
      isToastVisible,
      openUpdateDialog,
      openHistory,
      openWhatsNew,
      snoozeToast,
      dismissUpdate: dismiss,
    }),
    [hasUpdate, isToastVisible, openUpdateDialog, openHistory, openWhatsNew, snoozeToast, dismiss]
  );

  return (
    <UpdateUiContext.Provider value={value}>
      {children}

      {info && isToastVisible && (
        <UpdateToast
          info={info}
          onUpdate={() => {
            snoozeToast();
            openUpdateDialog();
          }}
          onViewNotes={() => {
            snoozeToast();
            openHistory();
          }}
          onSnooze={snoozeToast}
          onDismiss={() => {
            dismiss();
            setToastSnoozed(true);
          }}
        />
      )}

      {info && (
        <UpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          updateInfo={info}
        />
      )}

      {runningVersion && (
        <ReleaseHistoryDialog
          open={historyOpen}
          onOpenChange={handleHistoryOpenChange}
          currentVersion={runningVersion}
          defaultVersion={historyDefault}
        />
      )}
    </UpdateUiContext.Provider>
  );
}
