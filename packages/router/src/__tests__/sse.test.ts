/**
 * Tests for SSE (Server-Sent Events) utilities
 */

import { describe, expect, test } from 'bun:test';
import { createAsyncSSEStream, createSSEStream } from '../sse';

describe('SSE', () => {
  describe('createSSEStream', () => {
    test('returns a Response with correct headers', () => {
      const response = createSSEStream(() => undefined);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    test('sends data correctly', async () => {
      const response = createSSEStream((send, close) => {
        send({
          message: 'hello',
        });
        send({
          message: 'world',
        });
        setTimeout(close, 10);
      });

      const text = await response.text();

      expect(text).toContain('data: {"message":"hello"}');
      expect(text).toContain('data: {"message":"world"}');
    });

    test('sends data with event name', async () => {
      const response = createSSEStream((send, close) => {
        send(
          {
            value: 42,
          },
          'custom-event'
        );
        setTimeout(close, 10);
      });

      const text = await response.text();

      expect(text).toContain('event: custom-event');
      expect(text).toContain('data: {"value":42}');
    });

    test('calls cleanup on stream cancel', async () => {
      let cleaned = false;

      const response = createSSEStream((send) => {
        return () => {
          cleaned = true;
        };
      });

      // Cancel the stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Expected readable stream reader');
      }
      await reader.cancel();

      expect(cleaned).toBe(true);
    });
  });

  describe('createAsyncSSEStream', () => {
    test('returns a Response with correct headers', () => {
      const response = createAsyncSSEStream(async () => undefined);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    });

    test('sends async data correctly', async () => {
      const response = createAsyncSSEStream(async (send) => {
        send({
          type: 'start',
        });
        await new Promise((r) => setTimeout(r, 5));
        send({
          type: 'end',
        });
      });

      const text = await response.text();

      expect(text).toContain('data: {"type":"start"}');
      expect(text).toContain('data: {"type":"end"}');
    });

    test('sends event name with data', async () => {
      const response = createAsyncSSEStream(async (send) => {
        await Promise.resolve();
        send(
          {
            data: 'test',
          },
          'progress'
        );
      });

      const text = await response.text();

      expect(text).toContain('event: progress');
      expect(text).toContain('data: {"data":"test"}');
    });

    test('handles errors gracefully', async () => {
      const response = createAsyncSSEStream(async () => {
        await Promise.resolve();
        throw new Error('Test error');
      });

      const text = await response.text();

      expect(text).toContain('error');
      expect(text).toContain('Test error');
    });
  });
});
