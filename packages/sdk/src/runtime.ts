import type {
  AnyObj,
  EventHandler,
  Json,
  PluginApi,
  PluginInfo,
  ToolCallContext,
  ToolResult,
  ToolSpec,
} from "./types";
import { FrameReader, FrameWriter, type Wire } from "./ipc";
import type { CompiledTool } from "./tool";
import type { CompiledBlock, BlockContext, BlockResult, BlockRuntime, BlockHandler } from "./blocks/types";
import { expr } from "./blocks/define";

type ToolHandler = (args: AnyObj, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult;

function matchGlob(pattern: string, text: string): boolean {
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
  return regex.test(text);
}

export function createPluginRuntime(plugin: PluginInfo) {
  const tools = new Map<string, ToolHandler>();
  const blocks = new Map<string, CompiledBlock>();
  const stopHandlers: Array<() => void | Promise<void>> = [];
  const eventHandlers = new Map<string, Set<EventHandler>>();
  const vars = new Map<string, Json>();

  const stdin = Bun.stdin.stream() as ReadableStream<Uint8Array>;
  // Bun.stdout.writer() returns a FileSink, not a WritableStream
  // biome-ignore lint/suspicious/noExplicitAny: Bun's FileSink type
  const stdout = Bun.stdout.writer() as any;

  const reader = new FrameReader(stdin);
  const writer = new FrameWriter(stdout);

  // Create block runtime for executing blocks
  function createBlockRuntime(ctx: BlockContext): BlockRuntime {
    return {
      callTool: async (name, args) => {
        // Request tool call from hub via IPC
        const id = Date.now();
        await writer.send({
          t: "callTool",
          id,
          tool: name,
          args,
          ctx: { traceId: crypto.randomUUID(), source: "automation" },
        });
        // Note: In real implementation, we'd wait for toolResult - for now return null
        // The hub will handle tool calls directly
        return null;
      },
      emit: (type, payload) => {
        writer.send({ t: "emit", eventType: type, payload }).catch(() => {});
      },
      log: (level, message) => {
        writer.send({ t: "log", level, message }).catch(() => {});
      },
      evaluate: <T = Json>(expression: string, context: BlockContext): T => {
        return expr(expression, context) as T;
      },
      subscribe: (pattern, handler) => {
        const handlers = eventHandlers.get(pattern) ?? new Set();
        const wrappedHandler: EventHandler = (event) => handler({ type: event.type, payload: event.payload });
        handlers.add(wrappedHandler);
        eventHandlers.set(pattern, handlers);
        writer.send({ t: "subscribe", patterns: [pattern] }).catch(() => {});
        return () => {
          handlers.delete(wrappedHandler);
          if (handlers.size === 0) {
            eventHandlers.delete(pattern);
            writer.send({ t: "unsubscribe", patterns: [pattern] }).catch(() => {});
          }
        };
      },
      setVar: (name, value) => {
        vars.set(name, value);
      },
      getVar: (name) => vars.get(name),
    };
  }

  const api: PluginApi = {
    registerTool(spec: ToolSpec, handler: ToolHandler) {
      if (!spec?.id) throw new Error("Tool id required");
      if (tools.has(spec.id)) throw new Error(`Tool already registered: ${spec.id}`);
      tools.set(spec.id, handler);
      writer
        .send({
          t: "registerTool",
          tool: { id: spec.id, description: spec.description, inputSchema: spec.inputSchema },
        })
        .catch(() => {});
    },

    onStop(fn) {
      stopHandlers.push(fn);
    },

    log(level, message, meta) {
      writer.send({ t: "log", level, message, meta }).catch(() => {});
    },

    emit(eventType: string, payload: Json = null) {
      writer.send({ t: "emit", eventType, payload }).catch(() => {});
    },

    on(patterns: string | string[], handler: EventHandler) {
      const patternList = Array.isArray(patterns) ? patterns : [patterns];
      for (const p of patternList) {
        if (!eventHandlers.has(p)) eventHandlers.set(p, new Set());
        eventHandlers.get(p)!.add(handler);
      }
      writer.send({ t: "subscribe", patterns: patternList }).catch(() => {});
    },

    off(patterns: string | string[]) {
      const patternList = Array.isArray(patterns) ? patterns : [patterns];
      for (const p of patternList) {
        eventHandlers.delete(p);
      }
      writer.send({ t: "unsubscribe", patterns: patternList }).catch(() => {});
    },
  };

  async function handle(msg: Wire): Promise<void> {
    if (msg.t === "ping") {
      await writer.send({ t: "pong", ts: msg.ts });
      return;
    }

    if (msg.t === "stop") {
      for (let i = stopHandlers.length - 1; i >= 0; i--) {
        try {
          await stopHandlers[i]();
        } catch {}
      }
      await writer.close();
      process.exit(0);
    }

    if (msg.t === "callTool") {
      const h = tools.get(msg.tool);
      if (!h) {
        await writer.send({
          t: "toolResult",
          id: msg.id,
          result: { ok: false, content: `Unknown tool: ${msg.tool}` },
        });
        return;
      }
      try {
        const res = await h(msg.args, msg.ctx);
        await writer.send({ t: "toolResult", id: msg.id, result: res ?? { ok: true } });
      } catch (e) {
        await writer.send({
          t: "toolResult",
          id: msg.id,
          result: { ok: false, content: "Tool error", data: String(e) },
        });
      }
      return;
    }

    if (msg.t === "executeBlock") {
      const block = blocks.get(msg.blockType);
      if (!block) {
        await writer.send({
          t: "blockResult",
          id: msg.id,
          result: { error: `Unknown block type: ${msg.blockType}`, stop: true },
        });
        return;
      }
      try {
        const runtime = createBlockRuntime(msg.context);
        const result = await block.execute(msg.config, msg.context, runtime);
        await writer.send({ t: "blockResult", id: msg.id, result });
      } catch (e) {
        await writer.send({ t: "blockResult", id: msg.id, result: { error: String(e), stop: true } });
      }
      return;
    }

    if (msg.t === "event") {
      for (const [pattern, handlers] of eventHandlers) {
        if (matchGlob(pattern, msg.event.type)) {
          for (const h of handlers) {
            try {
              await h(msg.event);
            } catch {}
          }
        }
      }
      return;
    }
  }

  async function start(): Promise<void> {
    await writer.send({
      t: "hello",
      plugin: { id: plugin.id, version: plugin.version, requires: plugin.requires },
    });
    await writer.send({ t: "ready" });

    for (;;) {
      const msg = await reader.next();
      if (!msg) break;
      await handle(msg);
    }
  }

  /**
   * Register a compiled tool from defineTool()
   * The tool will be registered with plugin prefix: `pluginId:toolId`
   */
  function use(tool: CompiledTool): void {
    if (!tool?.id) throw new Error("Tool id required");
    if (tools.has(tool.id)) throw new Error(`Tool already registered: ${tool.id}`);
    tools.set(tool.id, tool.handler);
    writer
      .send({
        t: "registerTool",
        tool: { id: tool.id, description: tool.description, inputSchema: tool.inputSchema },
      })
      .catch(() => {});
  }

  /**
   * Register a compiled block from defineBlock()
   * The block will be registered with plugin prefix: `pluginId:blockId`
   */
  function useBlock(block: CompiledBlock): void {
    if (!block?.id) throw new Error("Block id required");
    if (blocks.has(block.id)) throw new Error(`Block already registered: ${block.id}`);
    blocks.set(block.id, block);
    // Send block definition to hub (without execute function)
    const { execute, ...definition } = block;
    writer.send({ t: "registerBlock", block: definition }).catch(() => {});
  }

  return { api, start, use, useBlock };
}
