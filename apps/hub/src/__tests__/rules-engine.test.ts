import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Rule } from '@brika/shared';
import { mock, spy, TestBed } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';
import { RulesEngine } from '@/runtime/rules/rules-engine';
import { type ScheduleCallback, SchedulerService } from '@/runtime/scheduler/scheduler-service';
import { StateStore } from '@/runtime/state/state-store';
import { ToolRegistry } from '@/runtime/tools/tool-registry';

describe('RulesEngine', () => {
  let mockLogs: LogRouter;
  let mockState: StateStore;
  let mockTools: ToolRegistry;
  let mockEvents: EventSystem;
  let mockScheduler: SchedulerService;
  let rules: Rule[];

  beforeEach(() => {
    rules = [];

    mockLogs = mock<LogRouter>({
      info: spy(),
      error: spy(),
      debug: spy(),
    });

    mockState = mock<StateStore>({
      listRules: () => rules,
      getRule: (id: string) => rules.find((r) => r.id === id),
      upsertRule: (r: Rule) => {
        const idx = rules.findIndex((x) => x.id === r.id);
        if (idx >= 0) rules[idx] = r;
        else rules.push(r);
        return Promise.resolve();
      },
      deleteRule: (id: string) => {
        const idx = rules.findIndex((r) => r.id === id);
        if (idx >= 0) rules.splice(idx, 1);
        return Promise.resolve();
      },
    });

    const toolCallSpy = spy<[string, Record<string, unknown>, unknown], Promise<{ ok: boolean }>>();
    toolCallSpy.mockResolvedValue({ ok: true });

    mockTools = mock<ToolRegistry>({
      call: toolCallSpy,
    });

    // Create a real-ish event system mock that captures subscriptions
    const noop = () => {
      /* unsubscribe */
    };
    mockEvents = mock<EventSystem>({
      subscribeAll: (() => noop) as EventSystem['subscribeAll'],
      subscribeGlob: (() => noop) as EventSystem['subscribeGlob'],
      dispatch: (() => Promise.resolve({})) as unknown as EventSystem['dispatch'],
    });

    // Create scheduler mock
    mockScheduler = mock<SchedulerService>({
      onTrigger: spy<[ScheduleCallback], () => void>().mockReturnValue(noop),
    });

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .provide(LogRouter, mockLogs)
      .provide(StateStore, mockState)
      .provide(ToolRegistry, mockTools)
      .provide(EventSystem, mockEvents)
      .provide(SchedulerService, mockScheduler)
      .compile();
  });

  afterEach(() => {
    TestBed.reset();
  });

  it('should create a rule', async () => {
    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const rule = await engine.create({
      name: 'Test Rule',
      trigger: { type: 'event', match: 'motion.*' },
      actions: [{ tool: 'light.on', args: {} }],
      enabled: true,
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('Test Rule');
    expect(rules).toHaveLength(1);
  });

  it('should list rules from state', () => {
    // Pre-populate rules
    rules.push({
      id: '1',
      name: 'Rule 1',
      trigger: { type: 'event', match: '*' },
      actions: [],
      enabled: true,
    });
    rules.push({
      id: '2',
      name: 'Rule 2',
      trigger: { type: 'event', match: '*' },
      actions: [],
      enabled: false,
    });

    const engine = TestBed.inject(RulesEngine);
    const listed = engine.list();

    expect(listed).toHaveLength(2);
  });

  it('should delete a rule', async () => {
    rules.push({
      id: 'delete-me',
      name: 'To Delete',
      trigger: { type: 'event', match: '*' },
      actions: [],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.delete('delete-me');

    expect(result).toBe(true);
    expect(rules).toHaveLength(0);
  });

  it('should return false when deleting non-existent rule', async () => {
    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.delete('not-found');
    expect(result).toBe(false);
  });

  it('should enable a rule', async () => {
    rules.push({
      id: 'to-enable',
      name: 'Disabled Rule',
      trigger: { type: 'event', match: '*' },
      actions: [],
      enabled: false,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.enable('to-enable');

    expect(result).toBe(true);
    expect(rules[0].enabled).toBe(true);
  });

  it('should disable a rule', async () => {
    rules.push({
      id: 'to-disable',
      name: 'Enabled Rule',
      trigger: { type: 'event', match: '*' },
      actions: [],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    await engine.init();

    const result = await engine.disable('to-disable');

    expect(result).toBe(true);
    expect(rules[0].enabled).toBe(false);
  });

  it('should get a rule by id', () => {
    rules.push({
      id: 'my-rule',
      name: 'My Rule',
      trigger: { type: 'event', match: 'test.*' },
      actions: [{ tool: 'test.action', args: {} }],
      enabled: true,
    });

    const engine = TestBed.inject(RulesEngine);
    const rule = engine.get('my-rule');

    expect(rule).toBeDefined();
    expect(rule?.name).toBe('My Rule');
  });

  it('should return undefined for non-existent rule', () => {
    const engine = TestBed.inject(RulesEngine);
    const rule = engine.get('does-not-exist');
    expect(rule).toBeUndefined();
  });
});
