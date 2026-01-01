import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TestBed, spy, mock } from "@elia/shared";
import { EventBus } from "../runtime/events/event-bus";
import { LogRouter } from "../runtime/logs/log-router";
import { HubConfig } from "../runtime/config";

describe("EventBus", () => {
  const errorSpy = spy<[string, object?]>();

  beforeEach(() => {
    errorSpy.reset();

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: spy(),
        error: errorSpy,
        warn: spy(),
        debug: spy(),
      })
      .compile();
  });

  afterEach(() => TestBed.reset());

  it("should emit events", () => {
    const bus = TestBed.get(EventBus);
    const event = bus.emit("test.event", "source", { data: 123 });

    expect(event.type).toBe("test.event");
    expect(event.source).toBe("source");
    expect(event.payload).toEqual({ data: 123 });
    expect(event.id).toBeDefined();
    expect(event.ts).toBeGreaterThan(0);
  });

  it("should notify subscribers with matching pattern", () => {
    const bus = TestBed.get(EventBus);
    const handler = spy();

    bus.subscribe("test.*", handler);
    bus.emit("test.one", "src", null);
    bus.emit("test.two", "src", null);
    bus.emit("other.event", "src", null);

    expect(handler.callCount).toBe(2);
  });

  it("should support glob patterns", () => {
    const bus = TestBed.get(EventBus);
    const handler = spy();

    bus.subscribe("motion.*", handler);

    bus.emit("motion.detected", "sensor", null);
    bus.emit("motion.stopped", "sensor", null);
    bus.emit("light.on", "switch", null);

    expect(handler.callCount).toBe(2);
  });

  it("should unsubscribe correctly", () => {
    const bus = TestBed.get(EventBus);
    const handler = spy();

    const unsub = bus.subscribe("test", handler);

    bus.emit("test", "src", null);
    expect(handler.callCount).toBe(1);

    unsub();

    bus.emit("test", "src", null);
    expect(handler.callCount).toBe(1); // Still 1, not called again
  });

  it("should notify global subscribers", () => {
    const bus = TestBed.get(EventBus);
    const globalHandler = spy();
    const patternHandler = spy();

    bus.subscribeAll(globalHandler);
    bus.subscribe("specific", patternHandler);

    bus.emit("specific", "src", null);
    bus.emit("other", "src", null);

    expect(globalHandler.callCount).toBe(2);
    expect(patternHandler.callCount).toBe(1);
  });

  it("should store events in ring buffer", () => {
    const bus = TestBed.get(EventBus);

    bus.emit("event.1", "src", { n: 1 });
    bus.emit("event.2", "src", { n: 2 });
    bus.emit("event.3", "src", { n: 3 });

    const events = bus.query();

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("event.1");
    expect(events[2].type).toBe("event.3");
  });

  it("should handle listener errors gracefully", () => {
    const bus = TestBed.get(EventBus);

    bus.subscribe("error.test", () => {
      throw new Error("Handler crashed!");
    });

    // Should not throw
    expect(() => bus.emit("error.test", "src", null)).not.toThrow();
    expect(errorSpy.called).toBe(true);
  });
});
