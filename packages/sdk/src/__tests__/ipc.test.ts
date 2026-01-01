import { describe, it, expect } from "bun:test";
import { FrameWriter, FrameReader, type Wire } from "../ipc";

describe("IPC Frame Protocol", () => {
  it("should encode and decode messages", async () => {
    const messages: Wire[] = [];
    
    // Create a simple in-memory stream for testing
    const chunks: Uint8Array[] = [];
    
    const writableStream = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });
    
    const writer = new FrameWriter(writableStream);
    
    const testMessage: Wire = {
      type: "tool_call",
      id: "123",
      name: "test.tool",
      args: { foo: "bar", count: 42 },
    };
    
    await writer.send(testMessage);
    await writer.close();
    
    // Combine all chunks into one buffer
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    // Create readable stream from combined buffer
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(combined);
        controller.close();
      },
    });
    
    const reader = new FrameReader(readableStream);
    const result = await reader.next();
    
    expect(result).toEqual(testMessage);
  });

  it("should handle multiple messages", async () => {
    const chunks: Uint8Array[] = [];
    
    const writableStream = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });
    
    const writer = new FrameWriter(writableStream);
    
    const messages: Wire[] = [
      { type: "ping" },
      { type: "pong" },
      { type: "tool_result", id: "1", result: { ok: true, content: "done" } },
    ];
    
    for (const msg of messages) {
      await writer.send(msg);
    }
    await writer.close();
    
    // Combine chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(combined);
        controller.close();
      },
    });
    
    const reader = new FrameReader(readableStream);
    
    const read1 = await reader.next();
    const read2 = await reader.next();
    const read3 = await reader.next();
    
    expect(read1).toEqual(messages[0]);
    expect(read2).toEqual(messages[1]);
    expect(read3).toEqual(messages[2]);
  });

  it("should return null when stream ends", async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    
    const reader = new FrameReader(readableStream);
    const result = await reader.next();
    
    expect(result).toBeNull();
  });

  it("should handle fragmented data", async () => {
    const testMessage: Wire = { type: "ping" };
    const payload = new TextEncoder().encode(JSON.stringify(testMessage));
    
    // Create header with length
    const header = new Uint8Array(4);
    const view = new DataView(header.buffer);
    view.setUint32(0, payload.byteLength, false);
    
    // Fragment into small pieces
    const full = new Uint8Array(header.byteLength + payload.byteLength);
    full.set(header, 0);
    full.set(payload, 4);
    
    // Split into 2-byte fragments
    const fragments: Uint8Array[] = [];
    for (let i = 0; i < full.byteLength; i += 2) {
      fragments.push(full.slice(i, Math.min(i + 2, full.byteLength)));
    }
    
    let fragmentIndex = 0;
    const readableStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (fragmentIndex < fragments.length) {
          controller.enqueue(fragments[fragmentIndex++]);
        } else {
          controller.close();
        }
      },
    });
    
    const reader = new FrameReader(readableStream);
    const result = await reader.next();
    
    expect(result).toEqual(testMessage);
  });
});

