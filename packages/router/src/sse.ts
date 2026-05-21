/**
 * Server-Sent Events (SSE) helper for streaming responses.
 *
 * CORS: intentionally no `Access-Control-Allow-Origin` here — origin policy
 * is enforced by the router's CORS middleware (per-request, per-allowlist).
 * A wildcard here would silently bypass that.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL = 30_000;
const heartbeatFrame = encoder.encode(': heartbeat\n\n');
/**
 * Tell EventSource to reconnect quickly after a hub restart. The browser
 * default is ~3s; 500ms keeps the UI responsive without thrashing.
 */
const retryFrame = encoder.encode('retry: 500\n\n');

function createSSESender(controller: ReadableStreamDefaultController<Uint8Array>) {
  return (data: unknown, event?: string) => {
    try {
      let message = '';
      if (event) {
        message += `event: ${event}\n`;
      }
      message += `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(message));
    } catch {
      // Stream might be closed
    }
  };
}

/**
 * Create an SSE response with a stream that can be written to.
 *
 * @example
 * ```ts
 * route.get("/stream/events", async ({ inject }) => {
 *   const events = inject(EventBus);
 *
 *   return createSSEStream((send, close) => {
 *     const unsub = events.subscribeAll((event) => {
 *       send({ type: "event", data: event });
 *     });
 *
 *     return () => unsub(); // Cleanup when client disconnects
 *   });
 * });
 * ```
 */
export function createSSEStream(
  setup: (send: (data: unknown, event?: string) => void, close: () => void) => (() => void) | void
): Response {
  let cleanup: (() => void) | void;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(retryFrame);
      const send = createSSESender(controller);

      const close = () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      cleanup = setup(send, close);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(heartbeatFrame);
        } catch {
          clearInterval(heartbeat);
          cleanup?.();
        }
      }, HEARTBEAT_INTERVAL);
    },
    cancel() {
      clearInterval(heartbeat);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}

/**
 * Create an async SSE stream for one-shot streaming operations.
 *
 * @example
 * ```ts
 * route.get("/stream/test", async ({ query, inject }) => {
 *   return createAsyncSSEStream(async (send) => {
 *     send({ type: "start" });
 *     await doSomething();
 *     send({ type: "complete" });
 *   });
 * });
 * ```
 */
export function createAsyncSSEStream(
  handler: (send: (data: unknown, event?: string) => void) => Promise<void>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(retryFrame);
      const send = createSSESender(controller);

      try {
        await handler(send);
      } catch (error) {
        send({
          type: 'error',
          error: String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
