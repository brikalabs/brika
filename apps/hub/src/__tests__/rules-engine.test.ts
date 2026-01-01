import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Rule } from '@elia/shared'
import { createAsyncSpyFn, createSpyFn, mock, TestBed } from '@elia/shared'
import { RulesEngine } from '../runtime/rules/rules-engine'
import { LogRouter } from '../runtime/logs/log-router'
import { StateStore } from '../runtime/state/state-store'
import { ToolRegistry } from '../runtime/tools/tool-registry'
import { EventBus } from '../runtime/events/event-bus'
import { SchedulerService } from '../runtime/scheduler/scheduler-service'
import { HubConfig } from '../runtime/config'

describe("RulesEngine", () => {
  let mockLogs: LogRouter;
  let mockState: StateStore;
  let mockTools: ToolRegistry;
  let mockEvents: EventBus;
  let mockScheduler: SchedulerService;
  let rules: Rule[];

  beforeEach(() => {
    rules = [];

    mockLogs = mock<LogRouter>({
      info: createSpyFn(),
      error: createSpyFn(),
      debug: createSpyFn(),
    });

    mockState = mock<StateStore>({
      listRules: () => rules,
      getRule: (id: string) => rules.find(r => r.id === id),
      upsertRule: async (r: Rule) => {
        const idx = rules.findIndex(x => x.id === r.id);
        if (idx >= 0) rules[idx] = r;
        else rules.push(r);
      },
      deleteRule: async (id: string) => {
        const idx = rules.findIndex(r => r.id === id);
        if (idx >= 0) rules.splice(idx, 1);
      },
    });

    mockTools = mock<ToolRegistry>({
      call: createAsyncSpyFn<[string, Record<string, unknown>, unknown], { ok: boolean }>({ ok: true }),
    });

    // Create a real-ish event bus mock that captures subscriptions
    const eventSubscribers: Array<(e: unknown) => void> = [];
    mockEvents = mock<EventBus>({
      subscribeAll: (fn: (e: unknown) => void) => {
        eventSubscribers.push(fn);
        return () => {};
      },
      emit: createSpyFn(),
    });

    // Create scheduler mock
    const schedulerCallbacks: Array<(id: string) => void> = [];
    mockScheduler = mock<SchedulerService>({
      onTrigger: (fn: (id: string) => void) => {
        schedulerCallbacks.push(fn);
        return () => {};
      },
    });

    TestBed
      .configureTestingModule()
      .provide(HubConfig, new HubConfig())
      .provide(LogRouter, mockLogs)
      .provide(StateStore, mockState)
      .provide(ToolRegistry, mockTools)
      .provide(EventBus, mockEvents)
      .provide(SchedulerService, mockScheduler);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("should create a rule", async () => {
    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const rule = await engine.create({
      name: "Test Rule",
      trigger: { type: "event", match: "motion.*" },
      actions: [{ tool: "light.on", args: {} }],
      enabled: true,
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe("Test Rule");
    expect(rules).toHaveLength(1);
  });

  it("should list rules from state", async () => {
    // Pre-populate rules
    rules.push({
      id: "1",
      name: "Rule 1",
      trigger: { type: "event", match: "*" },
      actions: [],
      enabled: true,
    });
    rules.push({
      id: "2",
      name: "Rule 2",
      trigger: { type: "event", match: "*" },
      actions: [],
      enabled: false,
    });

    const engine = TestBed.inject(RulesEngine);
    const listed = engine.list();

    expect(listed).toHaveLength(2);
  });

  it("should delete a rule", async () => {
    rules.push({
      id: "delete-me",
      name: "To Delete",
      trigger: { type: "event", match: "*" },
      actions: [],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.delete("delete-me");

    expect(result).toBe(true);
    expect(rules).toHaveLength(0);
  });

  it("should return false when deleting non-existent rule", async () => {
    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.delete("not-found");
    expect(result).toBe(false);
  });

  it("should enable a rule", async () => {
    rules.push({
      id: "to-enable",
      name: "Disabled Rule",
      trigger: { type: "event", match: "*" },
      actions: [],
      enabled: false,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.enable("to-enable");

    expect(result).toBe(true);
    expect(rules[0].enabled).toBe(true);
  });

  it("should disable a rule", async () => {
    rules.push({
      id: "to-disable",
      name: "Enabled Rule",
      trigger: { type: "event", match: "*" },
      actions: [],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.disable("to-disable");

    expect(result).toBe(true);
    expect(rules[0].enabled).toBe(false);
  });

  it("should get a rule by id", async () => {
    rules.push({
      id: "my-rule",
      name: "My Rule",
      trigger: { type: "event", match: "test.*" },
      actions: [{ tool: "test.action", args: {} }],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    const rule = engine.get("my-rule");

    expect(rule).toBeDefined();
    expect(rule?.name).toBe("My Rule");
  });

  it("should return undefined for non-existent rule", () => {
    const engine = TestBed.inject(RulesEngine);
    const rule = engine.get("does-not-exist");
    expect(rule).toBeUndefined();
  });
});
