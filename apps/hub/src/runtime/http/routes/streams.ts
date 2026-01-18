import { createSSEStream, NotFound, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { AutomationEngine } from '@/runtime/automations';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';

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
      const automations = inject(AutomationEngine);
      const events = inject(EventSystem);

      const workflow = automations.get(params.id);
      if (!workflow) throw new NotFound('Workflow not found');

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
            const event: WorkflowEvent = {
              type: action.type.split('.').slice(-1)[0] as WorkflowEventType,
              workflowId: params.id,
              blockId: (action.payload as { blockId?: string })?.blockId,
              portId: (action.payload as { portId?: string })?.portId,
              data: action.payload as Json,
              timestamp: action.timestamp,
            };
            send(event, 'workflow-event');
          }
        );

        return () => unsub();
      });
    }
  ),

  // SSE: Stream workflow execution events
  route.get(
    '/api/workflows/stream',
    {
      query: z.object({
        id: z.string(),
      }),
    },
    ({ query, inject }) => {
      const automations = inject(AutomationEngine);

      const workflow = automations.get(query.id);
      if (!workflow) throw new NotFound('Workflow not found');

      return createSSEStream((send, close) => {
        // Subscribe to execution events for this workflow
        const removeListener = automations.addGlobalListener((event) => {
          // Only send events for this workflow
          if ('workflowId' in event && event.workflowId === query.id) {
            send(event);

            // Close stream if workflow stopped
            if (event.type === 'workflow.stopped') {
              close();
            }
          }
        });

        // Start the workflow
        automations.setEnabled(query.id, true).catch((err: Error) => {
          send({ type: 'workflow.error', workflowId: query.id, error: String(err) });
          close();
        });

        // Return cleanup function
        return () => {
          removeListener();
          // Stop workflow when client disconnects
          if (automations.isWorkflowRunning(query.id)) {
            automations.setEnabled(query.id, false);
          }
        };
      });
    }
  ),
];
