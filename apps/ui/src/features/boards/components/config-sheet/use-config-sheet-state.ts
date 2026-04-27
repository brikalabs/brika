/**
 * State and persistence orchestration for the brick configuration
 * sheet: local label/config state, optimistic save with server revert,
 * delete handler, close-and-reset.
 *
 * Return type is inferred — the sheet imports the hook and destructures.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { boardsApi } from '@/features/boards/api';
import { useRemoveBrick, useRenameBrick } from '@/features/boards/hooks';
import { useBoardStore } from '@/features/boards/store';
import type { Json } from '@/types';

export function useConfigSheetState() {
  const configBrickId = useBoardStore((s) => s.configBrickId);
  const setConfigBrickId = useBoardStore((s) => s.setConfigBrickId);
  const activeBoard = useBoardStore((s) => s.activeBoard);
  const brickTypes = useBoardStore((s) => s.brickTypes);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutate: removeBrick } = useRemoveBrick();
  const { mutate: renameBrick } = useRenameBrick();

  const placement = useMemo(
    () => activeBoard?.bricks.find((c) => c.instanceId === configBrickId),
    [activeBoard, configBrickId]
  );
  const brickType = placement ? brickTypes.get(placement.brickTypeId) : null;

  const [localConfig, setLocalConfig] = useState<Record<string, Json>>({});
  const [localLabel, setLocalLabel] = useState('');

  // Sync form state only when a different brick config sheet opens.
  // Reading from the store inside the effect (instead of depending on
  // `placement`) prevents unrelated board mutations (layout drags,
  // SSE echo-backs, other brick changes) from resetting unsaved edits.
  const open = !!configBrickId;
  useEffect(() => {
    if (!configBrickId) {
      return;
    }
    const p = useBoardStore
      .getState()
      .activeBoard?.bricks.find((b) => b.instanceId === configBrickId);
    if (p) {
      setLocalConfig({ ...p.config });
      setLocalLabel(p.label ?? '');
    }
  }, [configBrickId]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setConfigBrickId(null);
        setLocalConfig({});
        setLocalLabel('');
      }
    },
    [setConfigBrickId]
  );

  const handleFieldChange = useCallback((name: string, value: Json) => {
    setLocalConfig((c) => ({ ...c, [name]: value }));
  }, []);

  const saveLabelIfChanged = useCallback(
    (instanceId: string) => {
      const trimmedLabel = localLabel.trim();
      const oldLabel = placement?.label ?? '';
      if (trimmedLabel !== oldLabel) {
        renameBrick({ instanceId, label: trimmedLabel || undefined });
      }
    },
    [localLabel, placement, renameBrick]
  );

  const saveConfigIfPresent = useCallback(
    async (boardId: string, instanceId: string) => {
      const configSchema = brickType?.config;
      if (!configSchema || configSchema.length === 0) {
        return;
      }
      useBoardStore.getState().updateBrickConfig(instanceId, localConfig);
      await boardsApi.updateBrick(boardId, instanceId, { config: localConfig });
    },
    [brickType, localConfig]
  );

  const revertOptimisticConfig = useCallback((instanceId: string) => {
    const serverPlacement = useBoardStore
      .getState()
      .activeBoard?.bricks.find((b) => b.instanceId === instanceId);
    if (serverPlacement) {
      setLocalConfig({ ...serverPlacement.config });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeBoard || !configBrickId) {
      return;
    }
    setSaving(true);
    try {
      saveLabelIfChanged(configBrickId);
      await saveConfigIfPresent(activeBoard.id, configBrickId);
      setConfigBrickId(null);
      setLocalConfig({});
      setLocalLabel('');
    } catch {
      revertOptimisticConfig(configBrickId);
    } finally {
      setSaving(false);
    }
  }, [
    activeBoard,
    configBrickId,
    saveLabelIfChanged,
    saveConfigIfPresent,
    revertOptimisticConfig,
    setConfigBrickId,
  ]);

  const handleDelete = useCallback(() => {
    if (!configBrickId) {
      return;
    }
    removeBrick(configBrickId);
    setDeleteOpen(false);
    setConfigBrickId(null);
  }, [configBrickId, removeBrick, setConfigBrickId]);

  return {
    open,
    configBrickId,
    placement,
    brickType,
    localConfig,
    localLabel,
    setLocalLabel,
    saving,
    deleteOpen,
    setDeleteOpen,
    handleClose,
    handleFieldChange,
    handleSave,
    handleDelete,
  };
}
