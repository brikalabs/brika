import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Schedule } from '@elia/shared';
import { mock, spy, TestBed } from '@elia/shared';
import { HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { SchedulerService } from '@/runtime/scheduler/scheduler-service';
import { StateStore } from '@/runtime/state/state-store';

describe('SchedulerService', () => {
  let mockLogs: LogRouter;
  let mockState: StateStore;
  let schedules: Schedule[];

  beforeEach(() => {
    schedules = [];

    mockLogs = mock<LogRouter>({
      info: spy(),
      error: spy(),
      debug: spy(),
    });

    mockState = mock<StateStore>({
      listSchedules: () => schedules,
      getSchedule: (id: string) => schedules.find((s) => s.id === id),
      upsertSchedule: async (s: Schedule) => {
        const idx = schedules.findIndex((x) => x.id === s.id);
        if (idx >= 0) schedules[idx] = s;
        else schedules.push(s);
      },
      deleteSchedule: async (id: string) => {
        const idx = schedules.findIndex((s) => s.id === id);
        if (idx >= 0) schedules.splice(idx, 1);
      },
    });

    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .provide(LogRouter, mockLogs)
      .provide(StateStore, mockState)
      .compile();
  });

  afterEach(() => {
    TestBed.reset();
  });

  it('should create a schedule with cron trigger', async () => {
    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const schedule = await scheduler.create({
      name: 'Test Schedule',
      trigger: { type: 'cron', expr: '0 * * * *' },
      action: { tool: 'test.tool', args: {} },
      enabled: true,
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.name).toBe('Test Schedule');
    expect(schedule.trigger.type).toBe('cron');
    expect(schedules).toHaveLength(1);
  });

  it('should create a schedule with interval trigger', async () => {
    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const schedule = await scheduler.create({
      name: 'Interval Schedule',
      trigger: { type: 'interval', ms: 60000 },
      action: { tool: 'test.tool', args: {} },
      enabled: true,
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.trigger.type).toBe('interval');
    expect(schedules).toHaveLength(1);
  });

  it('should list schedules', async () => {
    schedules.push({
      id: '1',
      name: 'Schedule 1',
      trigger: { type: 'cron', expr: '0 * * * *' },
      action: { tool: 'test.tool', args: {} },
      enabled: true,
    });
    schedules.push({
      id: '2',
      name: 'Schedule 2',
      trigger: { type: 'interval', ms: 30000 },
      action: { tool: 'other.tool', args: {} },
      enabled: false,
    });

    const scheduler = TestBed.inject(SchedulerService);
    const listed = scheduler.list();

    expect(listed).toHaveLength(2);
  });

  it('should delete a schedule', async () => {
    schedules.push({
      id: 'delete-me',
      name: 'To Delete',
      trigger: { type: 'cron', expr: '0 * * * *' },
      action: { tool: 'test.tool', args: {} },
      enabled: true,
    });

    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const result = await scheduler.delete('delete-me');

    expect(result).toBe(true);
    expect(schedules).toHaveLength(0);
  });

  it('should return false when deleting non-existent schedule', async () => {
    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const result = await scheduler.delete('not-found');
    expect(result).toBe(false);
  });

  it('should enable a schedule', async () => {
    schedules.push({
      id: 'to-enable',
      name: 'Disabled Schedule',
      trigger: { type: 'interval', ms: 5000 },
      action: { tool: 'test.tool', args: {} },
      enabled: false,
    });

    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const result = await scheduler.enable('to-enable');

    expect(result).toBe(true);
    expect(schedules[0].enabled).toBe(true);
  });

  it('should disable a schedule', async () => {
    schedules.push({
      id: 'to-disable',
      name: 'Enabled Schedule',
      trigger: { type: 'cron', expr: '*/5 * * * *' },
      action: { tool: 'test.tool', args: {} },
      enabled: true,
    });

    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const result = await scheduler.disable('to-disable');

    expect(result).toBe(true);
    expect(schedules[0].enabled).toBe(false);
  });

  it('should register trigger callbacks', async () => {
    const triggerSpy = spy();

    const scheduler = TestBed.inject(SchedulerService);
    await scheduler.init();

    const unsub = scheduler.onTrigger(triggerSpy);

    expect(typeof unsub).toBe('function');
  });

  it('should get a schedule by id', () => {
    schedules.push({
      id: 'my-schedule',
      name: 'My Schedule',
      trigger: { type: 'cron', expr: '0 0 * * *' },
      action: { tool: 'daily.task', args: {} },
      enabled: true,
    });

    const scheduler = TestBed.inject(SchedulerService);
    const schedule = scheduler.get('my-schedule');

    expect(schedule).toBeDefined();
    expect(schedule?.name).toBe('My Schedule');
  });

  it('should return undefined for non-existent schedule', () => {
    const scheduler = TestBed.inject(SchedulerService);
    const schedule = scheduler.get('does-not-exist');
    expect(schedule).toBeUndefined();
  });
});
