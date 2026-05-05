import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import type { ThemeConfig } from '@brika/ipc/contract';
import { TestApp } from '@brika/router/testing';
import { EventSystem } from '@/runtime/events/event-system';
import { settingsRoutes } from '@/runtime/http/routes/settings';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';

function makeTheme(id: string): ThemeConfig {
  return {
    version: 1,
    id,
    name: id,
    createdAt: 1,
    updatedAt: 2,
    radius: 0.5,
    fonts: { sans: 'Inter', mono: 'Mono' },
    colors: {
      light: {
        background: '#fff',
        foreground: '#000',
        card: '#fff',
        'card-foreground': '#000',
        popover: '#fff',
        'popover-foreground': '#000',
        primary: '#000',
        'primary-foreground': '#fff',
        secondary: '#eee',
        'secondary-foreground': '#000',
        accent: '#ddd',
        'accent-foreground': '#000',
        muted: '#eee',
        'muted-foreground': '#666',
        border: '#ddd',
        input: '#ddd',
        ring: '#000',
        success: '#0a0',
        'success-foreground': '#fff',
        warning: '#f80',
        'warning-foreground': '#000',
        info: '#08f',
        'info-foreground': '#fff',
        destructive: '#f00',
        'destructive-foreground': '#fff',
        'data-1': '#001',
        'data-2': '#002',
        'data-3': '#003',
        'data-4': '#004',
        'data-5': '#005',
        'data-6': '#006',
        'data-7': '#007',
        'data-8': '#008',
      },
      dark: {
        background: '#000',
        foreground: '#fff',
        card: '#111',
        'card-foreground': '#fff',
        popover: '#111',
        'popover-foreground': '#fff',
        primary: '#fff',
        'primary-foreground': '#000',
        secondary: '#222',
        'secondary-foreground': '#fff',
        accent: '#333',
        'accent-foreground': '#fff',
        muted: '#222',
        'muted-foreground': '#999',
        border: '#333',
        input: '#333',
        ring: '#fff',
        success: '#0f0',
        'success-foreground': '#000',
        warning: '#fa0',
        'warning-foreground': '#000',
        info: '#0af',
        'info-foreground': '#000',
        destructive: '#f33',
        'destructive-foreground': '#000',
        'data-1': '#101',
        'data-2': '#202',
        'data-3': '#303',
        'data-4': '#404',
        'data-5': '#505',
        'data-6': '#606',
        'data-7': '#707',
        'data-8': '#808',
      },
    },
  };
}

describe('settings routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockState: {
    getHubLocation: ReturnType<typeof mock>;
    setHubLocation: ReturnType<typeof mock>;
    getHubTimezone: ReturnType<typeof mock>;
    setHubTimezone: ReturnType<typeof mock>;
    applyTimezone: ReturnType<typeof mock>;
    listCustomThemes: ReturnType<typeof mock>;
    upsertCustomTheme: ReturnType<typeof mock>;
    deleteCustomTheme: ReturnType<typeof mock>;
    getActiveTheme: ReturnType<typeof mock>;
    setActiveTheme: ReturnType<typeof mock>;
  };
  let mockPm: {
    broadcastTimezone: ReturnType<typeof mock>;
  };
  let mockEvents: {
    dispatch: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockState = {
      getHubLocation: mock().mockReturnValue({
        latitude: 45.5,
        longitude: -73.6,
        street: '123 Main St',
        city: 'Montreal',
        state: 'QC',
        postalCode: 'H2X 1Y4',
        country: 'Canada',
        countryCode: 'CA',
        formattedAddress: '123 Main St, Montreal, QC',
      }),
      setHubLocation: mock().mockResolvedValue(undefined),
      getHubTimezone: mock().mockReturnValue('America/Montreal'),
      setHubTimezone: mock().mockResolvedValue(undefined),
      applyTimezone: mock(),
      listCustomThemes: mock().mockReturnValue([]),
      upsertCustomTheme: mock(),
      deleteCustomTheme: mock(),
      getActiveTheme: mock().mockReturnValue({ theme: null, mode: 'system' }),
      setActiveTheme: mock().mockImplementation((patch: Record<string, unknown>) => ({
        theme: null,
        mode: 'system',
        ...patch,
      })),
    };
    mockPm = {
      broadcastTimezone: mock(),
    };
    mockEvents = {
      dispatch: mock(),
    };
    stub(StateStore, mockState);
    stub(PluginManager, mockPm);
    stub(EventSystem, mockEvents);
    app = TestApp.create(settingsRoutes);
  });

  test('GET /api/settings/location returns location', async () => {
    const res = await app.get('/api/settings/location');

    expect(res.status).toBe(200);
    expect(mockState.getHubLocation).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/settings/location sets location', async () => {
    const loc = {
      latitude: 48.8,
      longitude: 2.35,
      street: '1 Rue de Rivoli',
      city: 'Paris',
      state: 'IDF',
      postalCode: '75001',
      country: 'France',
      countryCode: 'FR',
      formattedAddress: '1 Rue de Rivoli, Paris',
    };

    const res = await app.put('/api/settings/location', loc);

    expect(res.status).toBe(200);
    expect(mockState.setHubLocation).toHaveBeenCalledWith(loc);
  });

  test('DELETE /api/settings/location clears location', async () => {
    const res = await app.delete('/api/settings/location');

    expect(res.status).toBe(200);
    expect(mockState.setHubLocation).toHaveBeenCalledWith(null);
  });

  test('GET /api/settings/timezone returns timezone', async () => {
    const res = await app.get('/api/settings/timezone');

    expect(res.status).toBe(200);
    expect(mockState.getHubTimezone).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/settings/timezone sets timezone and applies it', async () => {
    const res = await app.put('/api/settings/timezone', { timezone: 'Europe/Paris' });

    expect(res.status).toBe(200);
    expect(mockState.setHubTimezone).toHaveBeenCalledWith('Europe/Paris');
    expect(mockState.applyTimezone).toHaveBeenCalled();
    expect(mockPm.broadcastTimezone).toHaveBeenCalledWith('Europe/Paris');
  });

  test('DELETE /api/settings/timezone clears timezone', async () => {
    const res = await app.delete('/api/settings/timezone');

    expect(res.status).toBe(200);
    expect(mockState.setHubTimezone).toHaveBeenCalledWith(null);
  });

  test('PUT /api/settings/timezone skips when timezone unchanged', async () => {
    const res = await app.put('/api/settings/timezone', { timezone: 'America/Montreal' });

    expect(res.status).toBe(200);
    expect(mockState.setHubTimezone).not.toHaveBeenCalled();
    expect(mockPm.broadcastTimezone).not.toHaveBeenCalled();
  });

  test('DELETE /api/settings/timezone skips when already null', async () => {
    (mockState.getHubTimezone as ReturnType<typeof mock>).mockReturnValue(null);

    const res = await app.delete('/api/settings/timezone');

    expect(res.status).toBe(200);
    expect(mockState.setHubTimezone).not.toHaveBeenCalled();
    expect(mockPm.broadcastTimezone).not.toHaveBeenCalled();
  });

  // ─── Custom themes ─────────────────────────────────────────────────────

  test('GET /api/settings/custom-themes returns the list', async () => {
    const theme = makeTheme('one');
    mockState.listCustomThemes.mockReturnValue([theme]);

    const res = await app.get('/api/settings/custom-themes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ themes: [theme] });
  });

  test('PUT /api/settings/custom-themes/:id upserts and dispatches invalidation', async () => {
    const theme = makeTheme('one');

    const res = await app.put(`/api/settings/custom-themes/${theme.id}`, theme);

    expect(res.status).toBe(200);
    expect(mockState.upsertCustomTheme).toHaveBeenCalledWith(theme);
    expect(mockEvents.dispatch).toHaveBeenCalledTimes(1);
    expect(mockEvents.dispatch.mock.calls[0]?.[0].type).toBe('theme.customThemesChanged');
  });

  test('PUT /api/settings/custom-themes/:id rejects mismatched ids', async () => {
    const theme = makeTheme('one');

    const res = await app.put('/api/settings/custom-themes/two', theme);

    expect(res.status).toBe(400);
    expect(mockState.upsertCustomTheme).not.toHaveBeenCalled();
    expect(mockEvents.dispatch).not.toHaveBeenCalled();
  });

  test('DELETE /api/settings/custom-themes/:id removes and dispatches invalidation', async () => {
    const res = await app.delete('/api/settings/custom-themes/one');

    expect(res.status).toBe(200);
    expect(mockState.deleteCustomTheme).toHaveBeenCalledWith('one');
    expect(mockEvents.dispatch).toHaveBeenCalledTimes(1);
    expect(mockEvents.dispatch.mock.calls[0]?.[0].type).toBe('theme.customThemesChanged');
  });

  // ─── Active theme ──────────────────────────────────────────────────────

  test('GET /api/settings/theme returns the active theme', async () => {
    mockState.getActiveTheme.mockReturnValue({ theme: 'mocha', mode: 'dark' });

    const res = await app.get('/api/settings/theme');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: 'mocha', mode: 'dark' });
  });

  test('PUT /api/settings/theme patches selection and dispatches activeChanged', async () => {
    mockState.setActiveTheme.mockReturnValue({ theme: 'mocha', mode: 'dark' });

    const res = await app.put('/api/settings/theme', { theme: 'mocha', mode: 'dark' });

    expect(res.status).toBe(200);
    expect(mockState.setActiveTheme).toHaveBeenCalledWith({ theme: 'mocha', mode: 'dark' });
    expect(mockEvents.dispatch).toHaveBeenCalledTimes(1);
    const dispatched = mockEvents.dispatch.mock.calls[0]?.[0];
    expect(dispatched.type).toBe('theme.activeChanged');
    expect(dispatched.payload).toEqual({ theme: 'mocha', mode: 'dark' });
  });

  test('PUT /api/settings/theme rejects empty patches', async () => {
    const res = await app.put('/api/settings/theme', {});

    expect(res.status).toBe(400);
    expect(mockState.setActiveTheme).not.toHaveBeenCalled();
    expect(mockEvents.dispatch).not.toHaveBeenCalled();
  });
});
