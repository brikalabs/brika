import type { Edge } from '@xyflow/react';
import type React from 'react';
import type { DebugEvent } from '../debug';
import type { BlockStatus } from './workflow-conversion';

// Simple ping animation using DOM manipulation
function pingHandle(blockId: string, portId: string) {
  const selector = `.react-flow__node[data-id="${blockId}"] .react-flow__handle[data-handleid="${portId}"]`;
  const handle = document.querySelector<HTMLElement>(selector);

  if (handle) {
    // Remove class first to allow re-triggering
    handle.classList.remove('handle-ping');
    // Force reflow to restart animation
    handle.getClientRects();
    handle.classList.add('handle-ping');
    // Self-cleaning via animationend — no dangling setTimeout
    handle.addEventListener('animationend', () => handle.classList.remove('handle-ping'), {
      once: true,
    });
  }
}

// Drive a block's status ring from a run lifecycle / emit / error event.
// block.start -> running (received input), block.emit -> completed (produced
// output), block.error -> error. States persist until the block next runs.
function applyBlockStatus(
  event: DebugEvent,
  setBlockStatus: (blockId: string, status: BlockStatus, output?: unknown) => void
) {
  if (!event.blockId) {
    return;
  }
  if (event.type === 'block.start') {
    setBlockStatus(event.blockId, 'running');
  } else if (event.type === 'block.error') {
    setBlockStatus(event.blockId, 'error', event.data);
  } else if (event.type === 'block.emit') {
    setBlockStatus(event.blockId, 'completed', event.data);
  }
}

// Ping the emitting output handle and every connected downstream input handle.
function pingEventPorts(blockId: string, port: string, edges: Edge[]) {
  pingHandle(blockId, port);
  for (const edge of edges) {
    if (edge.source === blockId && edge.sourceHandle === port) {
      pingHandle(edge.target, edge.targetHandle || 'in');
    }
  }
}

// Process new debug events: drive status rings, feed the latest emitted value
// into node-body views (useBlockData), and ping the relevant port handles.
export function processNewEvents(
  events: DebugEvent[],
  edges: Edge[],
  lastProcessedTimestamp: React.RefObject<number>,
  setBlockLiveOutput: (blockId: string, output: unknown) => void,
  setBlockStatus: (blockId: string, status: BlockStatus, output?: unknown) => void,
  setPortValue: (blockId: string, port: string, value: unknown) => void
) {
  const newEvents = events.filter((e) => e.timestamp > lastProcessedTimestamp.current);

  if (newEvents.length > 0) {
    lastProcessedTimestamp.current = Math.max(...newEvents.map((e) => e.timestamp));
  }

  for (const event of newEvents) {
    applyBlockStatus(event, setBlockStatus);

    if (event.type !== 'block.emit' || !event.blockId || !event.port) {
      continue;
    }
    if (event.data !== undefined) {
      setBlockLiveOutput(event.blockId, event.data);
      setPortValue(event.blockId, event.port, event.data);
    }
    pingEventPorts(event.blockId, event.port, edges);
  }
}
