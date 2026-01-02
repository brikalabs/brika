import type { Json, ToolInputSchema } from "./types";
import type { BlockDefinition, BlockResult, BlockContext } from "./blocks";

export type Wire =
  | { t: "hello"; plugin: { id: string; version: string; requires?: { hub?: string; sdk?: string } } }
  | { t: "ready" }
  | { t: "log"; level: "debug" | "info" | "warn" | "error"; message: string; meta?: Record<string, Json> }
  | { t: "registerTool"; tool: { id: string; description?: string; inputSchema?: ToolInputSchema } }
  | {
      t: "callTool";
      id: number;
      tool: string;
      args: Record<string, Json>;
      ctx: { traceId: string; source: "api" | "ui" | "voice" | "rule" | "automation" };
    }
  | { t: "toolResult"; id: number; result: { ok: boolean; content?: string; data?: Json } }
  | { t: "ping"; ts: number }
  | { t: "pong"; ts: number }
  | { t: "stop" }
  | { t: "fatal"; error: string }
  // Event Bus
  | { t: "emit"; eventType: string; payload: Json }
  | { t: "subscribe"; patterns: string[] }
  | { t: "unsubscribe"; patterns: string[] }
  | { t: "event"; event: { id: string; type: string; source: string; payload: Json; ts: number } }
  // Block System
  | { t: "registerBlock"; block: BlockDefinition }
  | { t: "executeBlock"; id: number; blockType: string; config: Record<string, Json>; context: BlockContext }
  | { t: "blockResult"; id: number; result: BlockResult };

const U32 = 4;

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(U32);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function readU32be(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

// Use Bun.serialize if available, otherwise JSON
function serialize(msg: Wire): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BunAny = typeof Bun !== "undefined" ? (Bun as any) : undefined;
  if (BunAny && typeof BunAny.serialize === "function") {
    return new Uint8Array(BunAny.serialize(msg));
  }
  // Fallback to JSON
  const encoder = new TextEncoder();
  return encoder.encode(JSON.stringify(msg));
}

function deserialize(data: Uint8Array): Wire {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BunAny = typeof Bun !== "undefined" ? (Bun as any) : undefined;
  if (BunAny && typeof BunAny.deserialize === "function") {
    return BunAny.deserialize(data) as Wire;
  }
  // Fallback to JSON
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(data)) as Wire;
}

// Bun's FileSink interface for proc.stdin
interface FileSink {
  write(data: Uint8Array): number;
  flush(): void | Promise<void>;
  end(): void | Promise<void>;
}

export class FrameWriter {
  readonly #sink: FileSink | null = null;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(stream: WritableStream<Uint8Array> | FileSink) {
    // Check if it's a FileSink (Bun's stdin) or WritableStream
    if ("getWriter" in stream && typeof stream.getWriter === "function") {
      this.#writer = stream.getWriter();
    } else {
      this.#sink = stream as FileSink;
    }
  }

  async send(msg: Wire): Promise<void> {
    const payload = serialize(msg);
    const header = u32be(payload.byteLength);
    const out = new Uint8Array(header.byteLength + payload.byteLength);
    out.set(header, 0);
    out.set(payload, U32);

    if (this.#writer) {
      await this.#writer.write(out);
    } else if (this.#sink) {
      this.#sink.write(out);
      await this.#sink.flush();
    }
  }

  async close(): Promise<void> {
    try {
      if (this.#writer) {
        await this.#writer.close();
      } else if (this.#sink) {
        await this.#sink.end();
      }
    } catch {}
  }
}

export class FrameReader {
  readonly #r: ReadableStreamDefaultReader<Uint8Array>;
  #buf = new Uint8Array(0);

  constructor(stream: ReadableStream<Uint8Array>) {
    this.#r = stream.getReader();
  }

  async next(): Promise<Wire | null> {
    for (;;) {
      if (this.#buf.byteLength >= U32) {
        const len = readU32be(this.#buf, 0);
        if (this.#buf.byteLength >= U32 + len) {
          const payload = this.#buf.slice(U32, U32 + len);
          this.#buf = this.#buf.slice(U32 + len);
          return deserialize(payload);
        }
      }

      const { value, done } = await this.#r.read();
      if (done) return null;
      if (!value || value.byteLength === 0) continue;

      const merged = new Uint8Array(this.#buf.byteLength + value.byteLength);
      merged.set(this.#buf, 0);
      merged.set(value, this.#buf.byteLength);
      this.#buf = merged;
    }
  }

  async close(): Promise<void> {
    try {
      await this.#r.cancel();
    } catch {}
  }
}
