import type { BrikaConfig } from '@/runtime/config/config-loader';

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { ConfigLoader } from '@/runtime/config';
import { healthRoute, systemRoute } from '@/runtime/http/routes/status';

describe('status routes', () => {
  // Only stub what needs specific configuration
  // PluginManager, BlockRegistry, WorkflowEngine, SparkRegistry are auto-stubbed
  useTestBed(() => {
    stub(ConfigLoader, {
      rootDir: '/test',
      configPath: '/test/brika.yml',
      brikaDir: '/test/.brika',
      get: () => ({ hub: { plugins: { installDir: 'plugins' } } }) as BrikaConfig,
    });
  });

  test('health route returns ok status', async () => {
    const res = await TestApp.call(healthRoute);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.version).toBeDefined();
    expect(res.body.build).toBeDefined();
    expect(res.body.build.commit).toBeDefined();
    expect(res.body.build.branch).toBeDefined();
    expect(res.body.build.date).toBeDefined();
  });

  test('system route returns system info', async () => {
    const res = await TestApp.call(systemRoute);

    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.runtime).toBeDefined();
    expect(res.body.stats.plugins).toBeDefined();
    expect(res.body.stats.blocks).toBeDefined();
    expect(res.body.stats.workflows).toBeDefined();
    expect(res.body.stats.sparks).toBeDefined();
  });
});
