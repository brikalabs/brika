import { useCallback, useEffect, useRef, useState } from 'react';
import { doSeek } from '../actions';

type CallAction = <I, O>(ref: { readonly __actionId: string }, input?: I) => Promise<O>;

export function useProgress(
  anchor: { progressMs: number; timestamp: number },
  isPlaying: boolean,
  durationMs: number,
  callAction: CallAction,
) {
  const [localProgressMs, setLocalProgressMs] = useState(anchor.progressMs);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);

  useEffect(() => {
    anchorRef.current = anchor;
    setLocalProgressMs(anchor.progressMs);
  }, [anchor.progressMs, anchor.timestamp]);

  useEffect(() => {
    if (!isPlaying || dragging) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - anchorRef.current.timestamp;
      setLocalProgressMs(Math.min(anchorRef.current.progressMs + elapsed, durationMs));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, dragging, durationMs]);

  const positionFromPointer = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || durationMs <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const positionMs = Math.round(ratio * durationMs);
      setLocalProgressMs(positionMs);
      return positionMs;
    },
    [durationMs],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      positionFromPointer(e.clientX);
    },
    [positionFromPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      positionFromPointer(e.clientX);
    },
    [positionFromPointer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      // Only send the seek API call on drag end (not on every move)
      const positionMs = positionFromPointer(e.clientX);
      callAction(doSeek, { positionMs });
    },
    [positionFromPointer, callAction],
  );

  const pct = durationMs > 0 ? (localProgressMs / durationMs) * 100 : 0;

  return { localProgressMs, pct, dragging, barRef, onPointerDown, onPointerMove, onPointerUp };
}
