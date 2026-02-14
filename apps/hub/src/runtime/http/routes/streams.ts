import { createSSEStream, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { WorkflowEngine } from '@/runtime/workflows';
import { getOrThrow } from '../utils/resource-helpers';

/**
 * Workflow event types for live debugging
 */
type WorkflowEventType =
  | 'block.input'
  | 'block.output'
  | 'block.state'
  | 'block.error'
  | 'workflow.start'
  | 'workflow.stop';

interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  blockId?: string;
  portId?: string;
  data?: Json;
  timestamp: number;
}

/**
 * Transform an EventSystem action into a WorkflowEvent.
 * Extracts the event type from the action type string and safely extracts payload fields.
 */
function transformActionToWorkflowEvent(
  action: { type: string; payload: unknown; timestamp: number },
  workflowId: string
): WorkflowEvent {
  const typeParts = action.type.split('.');
  const eventType = typeParts.at(-1) as WorkflowEventType;

  const payload = action.payload as Record<string, unknown> | null | undefined;

  return {
    type: eventType,
    workflowId,
    blockId: payload?.blockId as string | undefined,
    portId: payload?.portId as string | undefined,
    data: action.payload as Json,
    timestamp: action.timestamp,
  };
}

export const streamsRoutes = [
  // SSE: Stream logs
  route.get('/api/stream/logs', ({ inject }) => {
    const logs = inject(Logger);

    return createSSEStream((send) => {
      const unsub = logs.subscribe((event) => {
        send(event, 'log');
      });
      return () => unsub();
    });
  }),

  // SSE: Stream events
  route.get('/api/stream/events', ({ inject }) => {
    const events = inject(EventSystem);

    return createSSEStream((send) => {
      const unsub = events.subscribeAll((action) => {
        // Convert Action to BrikaEvent format for SSE
        const event = {
          id: action.id,
          type: action.type,
          source: action.source ?? 'unknown',
          payload: action.payload as Json,
          ts: action.timestamp,
        };
        send(event, 'event');
      });
      return () => unsub();
    });
  }),

  // SSE: Live workflow events for debugging
  route.get(
    '/api/workflows/:id/events',
    {
      params: z.object({ id: z.string() }),
    },
    ({ params, inject }) => {
      const workflows = inject(WorkflowEngine);
      const events = inject(EventSystem);

      const workflow = getOrThrow(workflows.get(params.id), 'Workflow not found');

      return createSSEStream((send) => {
        // Send initial state
        send({
          type: 'workflow.start',
          workflowId: params.id,
          blocks: workflow.blocks?.map((b) => b.id) ?? [],
          timestamp: Date.now(),
        } as WorkflowEvent);

        // Subscribe to events related to this workflow
        const unsub = events.subscribeGlob(
          [`workflow.${params.id}.*`, `block.${params.id}.*`],
          (action) => {
            const event = transformActionToWorkflowEvent(action, params.id);
            send(event, 'workflow-event');
          }
        );

        return () => unsub();
      });
    }
  ),
];
