import { BadRequest, createAsyncSSEStream, createSSEStream, NotFound, route } from '@brika/router';
import type { EliaEvent, Json } from '@brika/shared';
import { z } from 'zod';
import { AutomationEngine } from '@/runtime/automations';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';

export const streamsRoutes = [
  // SSE: Stream logs
  route.get('/api/stream/logs', ({ inject }) => {
    const logs = inject(LogRouter);

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
        // Convert Action to EliaEvent format for SSE
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

  // SSE: Test workflow execution with streaming events
  route.get(
    '/api/workflows/test',
    {
      query: z.object({
        id: z.string(),
        payload: z.string().optional(),
      }),
    },
    ({ query, inject }) => {
      const automations = inject(AutomationEngine);

      const workflow = automations.get(query.id);
      if (!workflow) throw new NotFound('Workflow not found');

      let payload: Json = {};
      if (query.payload) {
        try {
          payload = JSON.parse(query.payload);
        } catch {
          throw new BadRequest('Invalid payload JSON');
        }
      }

      return createAsyncSSEStream(async (send) => {
        // Emit start
        send({ type: 'workflow.start', workflowId: query.id });

        // Get blocks and emit events as they would run
        const blocks = workflow.blocks || [];

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          send({ type: 'block.start', blockId: block.id, index: i });

          // Simulate execution delay for visualization
          await new Promise((r) => setTimeout(r, 100));
        }

        // Actually run the workflow
        const run = await automations.trigger(query.id, 'test.trigger', 'test', payload);

        if (run.status === 'error') {
          send({ type: 'workflow.error', error: run.error });
        } else {
          // Emit completion for each block
          for (const block of blocks) {
            send({ type: 'block.complete', blockId: block.id, output: null });
          }
          send({
            type: 'workflow.complete',
            runId: run.id,
            duration: (run.finishedAt || Date.now()) - run.startedAt,
          });
        }
      });
    }
  ),
];
