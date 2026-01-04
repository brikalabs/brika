import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Rule, Schedule } from '@elia/shared';
import { mock, spy, TestBed } from '@elia/shared';
import { HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';

describe('StateStore', () => {
  let mockLogs: LogRouter;

  beforeEach(() => {
    mockLogs = mock<LogRouter>({
      info: spy(),
      error: spy(),
      debug: spy(),
    });

    TestBed.create().provide(HubConfig, new HubConfig()).provide(LogRouter, mockLogs).compile();
  });

  afterEach(() => {
    TestBed.reset();
  });

  describe('Plugin State', () => {
    it('should register and get plugin state', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-plugin',
        dir: '/path/to/plugin',
        uid: 'abc123',
      });

      const retrieved = store.get('test-plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved?.uid).toBe('abc123');
      expect(retrieved?.dir).toBe('/path/to/plugin');
      expect(retrieved?.enabled).toBe(true);
      expect(retrieved?.health).toBe('restarting'); // Initial state until hello message
    });

    it('should return undefined for unknown plugin', () => {
      const store = TestBed.inject(StateStore);
      const state = store.get('unknown');
      expect(state).toBeUndefined();
    });

    it('should list all installed plugins', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'plugin1',
        dir: '/path/to/plugin1',
        uid: 'uid1',
      });
      await store.registerPlugin({
        ref: 'plugin2',
        dir: '/path/to/plugin2',
        uid: 'uid2',
        enabled: false,
      });

      const all = store.listInstalled();
      expect(all).toHaveLength(2);
    });

    it('should set plugin enabled state', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-plugin',
        dir: '/path/to/plugin',
        uid: 'abc123',
      });

      expect(store.get('test-plugin')?.enabled).toBe(true);

      await store.setEnabled('test-plugin', false);
      expect(store.get('test-plugin')?.enabled).toBe(false);

      await store.setEnabled('test-plugin', true);
      expect(store.get('test-plugin')?.enabled).toBe(true);
    });

    it('should set plugin health', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-plugin',
        dir: '/path/to/plugin',
        uid: 'abc123',
      });

      await store.setHealth('test-plugin', 'crashed');

      const state = store.get('test-plugin');
      expect(state?.health).toBe('crashed');
    });

    it('should set plugin health with error', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-plugin',
        dir: '/path/to/plugin',
        uid: 'abc123',
      });

      await store.setHealth('test-plugin', 'crashed', 'Something went wrong');

      const state = store.get('test-plugin');
      expect(state?.health).toBe('crashed');
      expect(state?.lastError).toBe('Something went wrong');
    });

    it('should preserve plugin info when updating health', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'my-plugin',
        dir: '/path/to/myplugin',
        uid: 'xyz789',
      });

      await store.setHealth('my-plugin', 'crashed', 'Error occurred');

      const state = store.get('my-plugin');
      expect(state?.uid).toBe('xyz789');
      expect(state?.dir).toBe('/path/to/myplugin');
      expect(state?.health).toBe('crashed');
      expect(state?.lastError).toBe('Error occurred');
    });

    it('should get plugin by UID', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-ref',
        dir: '/path/to/plugin',
        uid: 'unique-id',
      });

      const byUid = store.getByUid('unique-id');
      expect(byUid).toBeDefined();
      expect(byUid?.ref).toBe('test-ref');
    });

    it('should remove plugin from state', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'to-remove',
        dir: '/path/to/plugin',
        uid: 'remove-me',
      });

      expect(store.listInstalled()).toHaveLength(1);

      await store.remove('to-remove');

      expect(store.listInstalled()).toHaveLength(0);
    });
  });

  describe('Metadata Cache', () => {
    it('should store and retrieve metadata', async () => {
      const store = TestBed.inject(StateStore);

      const metadata = await store.refreshMetadata('test-ref', '/path/to/plugin');

      expect(metadata).toBeDefined();
      expect(metadata.name).toBeDefined();

      const cached = store.getMetadata('test-ref');
      expect(cached).toEqual(metadata);
    });

    it('should provide plugin state with metadata', async () => {
      const store = TestBed.inject(StateStore);

      await store.registerPlugin({
        ref: 'test-plugin',
        dir: '/path/to/plugin',
        uid: 'abc123',
      });

      // Manually set metadata since we can't read real package.json in tests
      await store.refreshMetadata('test-plugin', '/path/to/plugin');

      const withMeta = store.getWithMetadata('test-plugin');
      expect(withMeta).toBeDefined();
      expect(withMeta?.uid).toBe('abc123');
      expect(withMeta?.metadata).toBeDefined();
      expect(withMeta?.name).toBeDefined();
      expect(withMeta?.version).toBeDefined();
    });
  });

  describe('Rules', () => {
    it('should store and retrieve rules', async () => {
      const store = TestBed.inject(StateStore);

      const rule: Rule = {
        id: 'test-rule',
        name: 'Test Rule',
        trigger: { type: 'event', match: 'motion.*' },
        actions: [{ tool: 'light.on', args: {} }],
        enabled: true,
      };

      await store.upsertRule(rule);
      const retrieved = store.getRule('test-rule');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Rule');
    });

    it('should list all rules', async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertRule({
        id: 'rule1',
        name: 'Rule 1',
        trigger: { type: 'event', match: '*' },
        actions: [],
        enabled: true,
      });

      await store.upsertRule({
        id: 'rule2',
        name: 'Rule 2',
        trigger: { type: 'event', match: '*' },
        actions: [],
        enabled: false,
      });

      const rules = store.listRules();
      expect(rules).toHaveLength(2);
    });

    it('should delete a rule', async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertRule({
        id: 'to-delete',
        name: 'Delete Me',
        trigger: { type: 'event', match: '*' },
        actions: [],
        enabled: true,
      });

      expect(store.listRules()).toHaveLength(1);

      await store.deleteRule('to-delete');

      expect(store.listRules()).toHaveLength(0);
    });
  });

  describe('Schedules', () => {
    it('should store and retrieve schedules', async () => {
      const store = TestBed.inject(StateStore);

      const schedule: Schedule = {
        id: 'test-schedule',
        name: 'Test Schedule',
        trigger: { type: 'cron', expr: '0 * * * *' },
        action: { tool: 'test.tool', args: {} },
        enabled: true,
      };

      await store.upsertSchedule(schedule);
      const retrieved = store.getSchedule('test-schedule');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Schedule');
    });

    it('should list all schedules', async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertSchedule({
        id: 'schedule1',
        name: 'Schedule 1',
        trigger: { type: 'interval', ms: 1000 },
        action: { tool: 'test.tool', args: {} },
        enabled: true,
      });

      await store.upsertSchedule({
        id: 'schedule2',
        name: 'Schedule 2',
        trigger: { type: 'cron', expr: '0 0 * * *' },
        action: { tool: 'other.tool', args: {} },
        enabled: false,
      });

      const schedules = store.listSchedules();
      expect(schedules).toHaveLength(2);
    });

    it('should delete a schedule', async () => {
      const store = TestBed.inject(StateStore);

      await store.upsertSchedule({
        id: 'to-delete',
        name: 'Delete Me',
        trigger: { type: 'interval', ms: 5000 },
        action: { tool: 'test.tool', args: {} },
        enabled: true,
      });

      expect(store.listSchedules()).toHaveLength(1);

      await store.deleteSchedule('to-delete');

      expect(store.listSchedules()).toHaveLength(0);
    });
  });
});
