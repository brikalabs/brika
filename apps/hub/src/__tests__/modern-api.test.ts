/**
 * Modern Testing API Showcase
 * 
 * Demonstrates the improved DX with:
 * - spy() with Vitest/Jest-like API
 * - mock() for type-safe partial mocks
 * - Fluent TestBed API
 */

import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TestBed, spy, mock, autoMock } from "@elia/shared";
import { ToolRegistry } from "../runtime/tools/tool-registry";
import { EventBus } from "../runtime/events/event-bus";
import { LogRouter } from "../runtime/logs/log-router";
import { HubConfig } from "../runtime/config";

describe("Modern spy() API", () => {
  it("should track calls", () => {
    const fn = spy<[string, number], string>();
    fn.mockReturnValue("result");

    const result = fn("hello", 42);

    expect(result).toBe("result");
    expect(fn.called).toBe(true);
    expect(fn.callCount).toBe(1);
    expect(fn.lastCall).toEqual(["hello", 42]);
    expect(fn.firstCall).toEqual(["hello", 42]);
  });

  it("should support mockReturnValueOnce", () => {
    const fn = spy<[], number>();
    fn.mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValue(999);

    expect(fn()).toBe(1);
    expect(fn()).toBe(2);
    expect(fn()).toBe(999);
    expect(fn()).toBe(999);
  });

  it("should support mockImplementation", () => {
    const fn = spy<[number], number>();
    fn.mockImplementation((n) => n * 2);

    expect(fn(5)).toBe(10);
    expect(fn(10)).toBe(20);
  });

  it("should support mockImplementationOnce", () => {
    const fn = spy<[number], number>();
    fn.mockImplementationOnce((n) => n * 2)
      .mockImplementationOnce((n) => n * 3)
      .mockReturnValue(0);

    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(15);
    expect(fn(5)).toBe(0);
  });

  it("should support async mockResolvedValue", async () => {
    const fn = spy<[string], Promise<string>>();
    fn.mockResolvedValue("async result");

    const result = await fn("test");
    expect(result).toBe("async result");
  });

  it("should support async mockRejectedValue", async () => {
    const fn = spy<[], Promise<void>>();
    fn.mockRejectedValue(new Error("oops"));

    await expect(fn()).rejects.toThrow("oops");
  });

  it("should support calledWith", () => {
    const fn = spy<[string, number]>();
    
    fn("a", 1);
    fn("b", 2);
    fn("c", 3);

    expect(fn.calledWith("a", 1)).toBe(true);
    expect(fn.calledWith("b", 2)).toBe(true);
    expect(fn.calledWith("x", 99)).toBe(false);
  });

  it("should support nthCall", () => {
    const fn = spy<[string]>();
    
    fn("first");
    fn("second");
    fn("third");

    expect(fn.nthCall(0)).toEqual(["first"]);
    expect(fn.nthCall(1)).toEqual(["second"]);
    expect(fn.nthCall(2)).toEqual(["third"]);
  });

  it("should reset properly", () => {
    const fn = spy<[], number>();
    fn.mockReturnValue(42);

    fn();
    fn();
    expect(fn.callCount).toBe(2);

    fn.reset();
    expect(fn.callCount).toBe(0);
    expect(fn.called).toBe(false);
  });
});

describe("Modern mock() API", () => {
  it("should create type-safe partial mocks", () => {
    interface Logger {
      info(msg: string): void;
      error(msg: string): void;
      debug(msg: string): void;
    }

    const logger = mock<Logger>({
      info: spy(),
      error: spy(),
    });

    logger.info("test");
    expect((logger.info as ReturnType<typeof spy>).called).toBe(true);
  });

  it("should work with autoMock", () => {
    interface Service {
      method1(): string;
      method2(n: number): number;
    }

    const service = autoMock<Service>(["method1", "method2"]);
    
    service.method1();
    service.method2(42);

    expect(service.method1.called).toBe(true);
    expect(service.method2.called).toBe(true);
    expect(service.method2.lastCall).toEqual([42]);
  });
});

describe("Fluent TestBed API", () => {
  afterEach(() => TestBed.reset());

  it("should use fluent builder pattern", () => {
    const infoSpy = spy<[string, object?]>();
    
    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: infoSpy,
        error: spy(),
        warn: spy(),
        debug: spy(),
      })
      .compile();

    const registry = TestBed.get(ToolRegistry);
    registry.register({
      name: "test.tool",
      owner: "test",
      call: async () => ({ ok: true }),
    });

    expect(infoSpy.called).toBe(true);
    expect(infoSpy.lastCall?.[0]).toBe("tool.register");
  });

  it("should support legacy API for backwards compatibility", () => {
    const errorSpy = spy();

    TestBed.configureTestingModule()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: spy(),
        error: errorSpy,
        warn: spy(),
        debug: spy(),
      });

    const bus = TestBed.inject(EventBus);
    
    bus.subscribe("test", () => {
      throw new Error("boom");
    });
    
    bus.emit("test", "src", null);

    expect(errorSpy.called).toBe(true);
  });
});

describe("Real-world testing patterns", () => {
  afterEach(() => TestBed.reset());

  it("should test event-driven behavior", () => {
    const handler = spy<[{ type: string }]>();

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: spy(),
        error: spy(),
        warn: spy(),
        debug: spy(),
      })
      .compile();

    const bus = TestBed.get(EventBus);
    bus.subscribe("motion.*", handler);

    bus.emit("motion.detected", "sensor", { room: "living" });
    bus.emit("motion.stopped", "sensor", { room: "living" });
    bus.emit("light.on", "switch", null);

    expect(handler.callCount).toBe(2);
    expect(handler.nthCall(0)?.[0].type).toBe("motion.detected");
    expect(handler.nthCall(1)?.[0].type).toBe("motion.stopped");
  });

  it("should test tool calls with assertions", async () => {
    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: spy(),
        error: spy(),
        warn: spy(),
        debug: spy(),
      })
      .compile();

    const registry = TestBed.get(ToolRegistry);
    
    const toolHandler = spy<[Record<string, unknown>, unknown], Promise<{ ok: boolean; content: string }>>();
    toolHandler.mockResolvedValue({ ok: true, content: "done" });

    registry.register({
      name: "light.on",
      owner: "hue",
      call: toolHandler,
    });

    const result = await registry.call(
      "light.on",
      { room: "bedroom", brightness: 80 },
      { traceId: "123", source: "rule" }
    );

    expect(result.ok).toBe(true);
    expect(toolHandler.called).toBe(true);
    expect(toolHandler.lastCall?.[0]).toEqual({ room: "bedroom", brightness: 80 });
  });
});

