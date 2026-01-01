import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { PluginHealth, Rule, Schedule } from '@elia/shared'
import { createSpyFn, mock, TestBed } from '@elia/shared'
import { StateStore } from '../runtime/state/state-store'
import { LogRouter } from '../runtime/logs/log-router'
import { HubConfig } from '../runtime/config'

describe("StateStore", () => {
  let mockLogs: LogRouter;

  beforeEach(() => {
    mockLogs = mock<LogRouter>({
      info: createSpyFn(),
      error: createSpyFn(),
      debug: createSpyFn(),
    });

    TestBed
      .configureTestingModule()
      .provide(HubConfig, new HubConfig())
      .provide(LogRouter, mockLogs);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe("Plugin State", () => {
    it("should set and get plugin state", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsert({
        ref: "test-plugin",
        enabled: true,
        health: { status: "running", lastHeartbeat: Date.now() },
        updatedAt: Date.now(),
      });

      const retrieved = store.get("test-plugin");

      expect(retrieved).toBeDefined();
      expect(retrieved?.enabled).toBe(true);
    });

    it("should return undefined for unknown plugin", () => {
      const store = TestBed.inject(StateStore);
      const state = store.get("unknown");
      expect(state).toBeUndefined();
    });

    it("should list all installed plugins", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsert({
        ref: "plugin1",
        enabled: true,
        health: { status: "running", lastHeartbeat: Date.now() },
        updatedAt: Date.now(),
      });
      await store.upsert({
        ref: "plugin2",
        enabled: false,
        health: { status: "stopped" },
        updatedAt: Date.now(),
      });

      const all = store.listInstalled();
      expect(all).toHaveLength(2);
    });

    it("should set plugin enabled state", async () => {
      const store = TestBed.inject(StateStore);

      await store.setEnabled("test-plugin", true);
      expect(store.get("test-plugin")?.enabled).toBe(true);

      await store.setEnabled("test-plugin", false);
      expect(store.get("test-plugin")?.enabled).toBe(false);
    });

    it("should set plugin health", async () => {
      const store = TestBed.inject(StateStore);
      const health: PluginHealth = { status: "running", lastHeartbeat: Date.now() };

      await store.setHealth("test-plugin", health);

      const state = store.get("test-plugin");
      expect(state?.health).toEqual(health);
    });

    it("should set plugin health with error", async () => {
      const store = TestBed.inject(StateStore);
      const health: PluginHealth = { status: "crashed" };

      await store.setHealth("test-plugin", health, "Something went wrong");

      const state = store.get("test-plugin");
      expect(state?.health.status).toBe("crashed");
      expect(state?.lastError).toBe("Something went wrong");
    });

    it("should summarize plugin state", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsert({
        ref: "my-plugin",
        enabled: true,
        health: { status: "running", lastHeartbeat: Date.now() },
        lastError: "previous error",
        updatedAt: Date.now(),
      });

      const summary = store.summarize("my-plugin");

      expect(summary.ref).toBe("my-plugin");
      expect(summary.health.status).toBe("running");
      expect(summary.lastError).toBe("previous error");
    });
  });

  describe("Rules", () => {
    it("should store and retrieve rules", async () => {
      const store = TestBed.inject(StateStore);

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        trigger: { type: "event", match: "motion.*" },
        actions: [{ tool: "light.on", args: {} }],
        enabled: true,
      };

      await store.upsertRule(rule);
      const retrieved = store.getRule("test-rule");

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test Rule");
    });

    it("should list all rules", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertRule({
        id: "rule1",
        name: "Rule 1",
        trigger: { type: "event", match: "*" },
        actions: [],
        enabled: true,
      });

      await store.upsertRule({
        id: "rule2",
        name: "Rule 2",
        trigger: { type: "event", match: "*" },
        actions: [],
        enabled: false,
      });

      const rules = store.listRules();
      expect(rules).toHaveLength(2);
    });

    it("should delete a rule", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertRule({
        id: "to-delete",
        name: "Delete Me",
        trigger: { type: "event", match: "*" },
        actions: [],
        enabled: true,
      });

      expect(store.listRules()).toHaveLength(1);

      await store.deleteRule("to-delete");

      expect(store.listRules()).toHaveLength(0);
    });
  });

  describe("Schedules", () => {
    it("should store and retrieve schedules", async () => {
      const store = TestBed.inject(StateStore);

      const schedule: Schedule = {
        id: "test-schedule",
        name: "Test Schedule",
        trigger: { type: "cron", expr: "0 * * * *" },
        action: { tool: "test.tool", args: {} },
        enabled: true,
      };

      await store.upsertSchedule(schedule);
      const retrieved = store.getSchedule("test-schedule");

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test Schedule");
    });

    it("should list all schedules", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertSchedule({
        id: "schedule1",
        name: "Schedule 1",
        trigger: { type: "interval", ms: 1000 },
        action: { tool: "test.tool", args: {} },
        enabled: true,
      });

      await store.upsertSchedule({
        id: "schedule2",
        name: "Schedule 2",
        trigger: { type: "cron", expr: "0 0 * * *" },
        action: { tool: "other.tool", args: {} },
        enabled: false,
      });

      const schedules = store.listSchedules();
      expect(schedules).toHaveLength(2);
    });

    it("should delete a schedule", async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertSchedule({
        id: "to-delete",
        name: "Delete Me",
        trigger: { type: "interval", ms: 5000 },
        action: { tool: "test.tool", args: {} },
        enabled: true,
      });

      expect(store.listSchedules()).toHaveLength(1);

      await store.deleteSchedule("to-delete");

      expect(store.listSchedules()).toHaveLength(0);
    });
  });
});
