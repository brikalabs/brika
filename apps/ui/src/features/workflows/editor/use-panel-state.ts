import { useCallback, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';

export type PanelName = 'blocks' | 'inspector';

interface PanelStates {
  blocks: boolean;
  inspector: boolean;
}

// One panel per side. The block library starts collapsed (Cmd+K and the
// wire-drop picker cover adding blocks); the right inspector carries either
// the selected block's config or the runs/live observability, never both.
const DEFAULT_PANEL_STATES: PanelStates = {
  blocks: false,
  inspector: true,
};

const PANEL_STORAGE_KEY = 'workflow-editor-panels-v2';

function isValidPanelStates(value: unknown): value is PanelStates {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blocks' in value &&
    'inspector' in value &&
    typeof (value as PanelStates).blocks === 'boolean' &&
    typeof (value as PanelStates).inspector === 'boolean'
  );
}

export function usePanelState() {
  const capture = useCapture();
  const [panelStates, setPanelStates] = useState<PanelStates>(() => {
    try {
      const saved = localStorage.getItem(PANEL_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isValidPanelStates(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return DEFAULT_PANEL_STATES;
  });

  const togglePanel = useCallback(
    (panel: PanelName) => {
      setPanelStates((prev: PanelStates) => {
        const next = {
          ...prev,
          [panel]: !prev[panel],
        };
        capture('workflow.editor_panel_toggled', { panel, open: next[panel] });
        localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [capture]
  );

  const openPanel = useCallback((panel: PanelName) => {
    setPanelStates((prev: PanelStates) => {
      if (prev[panel]) {
        return prev;
      }
      const next = { ...prev, [panel]: true };
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    panelStates,
    togglePanel,
    openPanel,
  };
}
