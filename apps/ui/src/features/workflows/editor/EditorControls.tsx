import { Button } from '@brika/clay';
import { Panel, useReactFlow, useStoreApi } from '@xyflow/react';
import { Lock, Maximize2, Minus, Plus, Redo2, Undo2, Unlock } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';

interface EditorControlsProps {
  showInteractive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function EditorControls({
  showInteractive,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Readonly<EditorControlsProps>) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const store = useStoreApi();
  const capture = useCapture();
  const [locked, setLocked] = useState(false);

  const toggleLock = useCallback(() => {
    setLocked((prev) => {
      const next = !prev;
      capture('workflow.canvas_lock_toggled', { locked: next });
      store.setState({
        nodesDraggable: !next,
        nodesConnectable: !next,
        elementsSelectable: !next,
      });
      return next;
    });
  }, [store, capture]);

  return (
    <Panel position="bottom-left">
      <div className="flex flex-col rounded-md border bg-background shadow-sm">
        {showInteractive && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-none rounded-t-md"
              disabled={!canUndo}
              onClick={() => {
                capture('workflow.canvas_undo');
                onUndo();
              }}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-none"
              disabled={!canRedo}
              onClick={() => {
                capture('workflow.canvas_redo');
                onRedo();
              }}
            >
              <Redo2 className="size-3.5" />
            </Button>
          </>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none rounded-t-md"
          onClick={() => {
            capture('workflow.canvas_zoom_in');
            zoomIn();
          }}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          onClick={() => {
            capture('workflow.canvas_zoom_out');
            zoomOut();
          }}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          onClick={() => {
            capture('workflow.canvas_fit_view');
            fitView();
          }}
        >
          <Maximize2 className="size-3.5" />
        </Button>
        {showInteractive && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-none rounded-b-md"
            onClick={toggleLock}
          >
            {locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
          </Button>
        )}
      </div>
    </Panel>
  );
}
