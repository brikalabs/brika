import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TestBed, spy, mock } from "@elia/shared";
import { ToolRegistry } from "../runtime/tools/tool-registry";
import { LogRouter } from "../runtime/logs/log-router";
import { HubConfig } from "../runtime/config";

describe("ToolRegistry", () => {
  // Spies for assertions
  const infoSpy = spy<[string, object?]>();
  const errorSpy = spy<[string, object?]>();

  beforeEach(() => {
    // Reset spies
    infoSpy.reset();
    errorSpy.reset();

    // Modern fluent API
    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: infoSpy,
        error: errorSpy,
        warn: spy(),
        debug: spy(),
      })
      .compile();
  });

  afterEach(() => TestBed.reset());

  it("should register a tool", () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register("tool", "test", {
      description: "A test tool",
      call: async () => ({ ok: true, content: "done" }),
    });

    const tools = registry.list();
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe("test:tool");
  });

  it("should log on register", () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register("tool", "plugin", {
      call: async () => ({ ok: true }),
    });

    expect(infoSpy.called).toBe(true);
    expect(infoSpy.lastCall?.[0]).toBe("tool.register");
  });

  it("should prevent duplicate registration", () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register("tool", "owner", {
      call: async () => ({ ok: true }),
    });

    expect(() => {
      registry.register("tool", "owner", {
        call: async () => ({ ok: true }),
      });
    }).toThrow("Tool already registered: owner:tool");
  });

  it("should unregister a tool", () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register("tool", "test", {
      call: async () => ({ ok: true }),
    });

    expect(registry.list()).toHaveLength(1);
    registry.unregister("test:tool");
    expect(registry.list()).toHaveLength(0);
  });

  it("should unregister by owner", () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register("a", "plugin1", { call: async () => ({ ok: true }) });
    registry.register("b", "plugin1", { call: async () => ({ ok: true }) });
    registry.register("c", "plugin2", { call: async () => ({ ok: true }) });

    expect(registry.list()).toHaveLength(3);
    registry.unregisterByOwner("plugin1");

    const remaining = registry.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("plugin2:c");
  });

  it("should call a tool", async () => {
    const registry = TestBed.get(ToolRegistry);
    const handler = spy<[Record<string, unknown>, unknown], Promise<{ ok: boolean; content: string }>>();
    handler.mockResolvedValue({ ok: true, content: "success" });

    registry.register("tool", "test", {
      call: handler,
    });

    const result = await registry.call("test:tool", { arg: "value" }, { traceId: "123", source: "api" });

    expect(result.ok).toBe(true);
    expect(result.content).toBe("success");
    expect(handler.called).toBe(true);
    expect(handler.lastCall?.[0]).toEqual({ arg: "value" });
  });

  it("should return error for unknown tool", async () => {
    const registry = TestBed.get(ToolRegistry);
    const result = await registry.call("unknown", {}, { traceId: "123", source: "api" });

    expect(result.ok).toBe(false);
    expect(result.content).toContain("Unknown tool");
  });
});
