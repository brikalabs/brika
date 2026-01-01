/**
 * Server-Sent Events (SSE) helper for streaming responses.
 */

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

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
  setup: (
    send: (data: unknown, event?: string) => void,
    close: () => void,
  ) => (() => void) | void,
): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | void;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown, event?: string) => {
        try {
          let message = "";
          if (event) {
            message += `event: ${event}\n`;
          }
          message += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream might be closed
        }
      };

      const close = () => {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      cleanup = setup(send, close);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
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
  handler: (send: (data: unknown, event?: string) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown, event?: string) => {
        try {
          let message = "";
          if (event) {
            message += `event: ${event}\n`;
          }
          message += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream might be closed
        }
      };

      try {
        await handler(send);
      } catch (error) {
        send({ type: "error", error: String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

