import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { UserPreferencesService } from '@brika/auth/server';
import { stub, useTestBed } from '@brika/di/testing';
import type { ThemeConfigType } from '@brika/ipc/contract';
import type { Middleware } from '@brika/router';
import { TestApp } from '@brika/router/testing';
import { EventSystem } from '@/runtime/events/event-system';
import { settingsRoutes } from '@/runtime/http/routes/settings';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';

const SESSION = {
  id: 'sess-1',
  userId: 'user-1',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: 'user',
  scopes: [],
};

function withSession(): Middleware {
  return async (c, next) => {
    c.set('session', SESSION);
    await next();
  };
}

function makeTheme(id: string, overrides: Partial<ThemeConfigType> = {}): ThemeConfigType {
  const color = '#000000';
  const baseColors = {
    background: color,
    foreground: color,
    card: color,
    'card-foreground': color,
    popover: color,
    'popover-foreground': color,
    primary: color,
    'primary-foreground': color,
    secondary: color,
    'secondary-foreground': color,
    accent: color,
    'accent-foreground': color,
    muted: color,
    'muted-foreground': color,
    border: color,
    input: color,
    ring: color,
    success: color,
    'success-foreground': color,
    warning: color,
    'warning-foreground': color,
    info: color,
    'info-foreground': color,
    destructive: color,
    'destructive-foreground': color,
    'data-1': color,
    'data-2': color,
    'data-3': color,
    'data-4': color,
    'data-5': color,
    'data-6': color,
    'data-7': color,
    'data-8': color,
  };
  return {
    version: 1,
    id,
    name: `Theme ${id}`,
    createdAt: 1,
    updatedAt: 1,
    radius: 0.5,
    fonts: { sans: 'Inter', mono: 'JetBrains Mono' },
    colors: { light: baseColors, dark: baseColors },
    ...overrides,
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
    getCustomTheme: ReturnType<typeof mock>;
    upsertCustomTheme: ReturnType<typeof mock>;
    removeCustomTheme: ReturnType<typeof mock>;
  };
  let mockPm: {
    broadcastTimezone: ReturnType<typeof mock>;
  };
  let mockPrefs: {
    get: ReturnType<typeof mock>;
    update: ReturnType<typeof mock>;
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
      getCustomTheme: mock().mockReturnValue(null),
      upsertCustomTheme: mock(),
      removeCustomTheme: mock().mockReturnValue(true),
    };
    mockPm = {
      broadcastTimezone: mock(),
    };
    mockPrefs = {
      get: mock().mockReturnValue({ activeTheme: null, colorMode: null }),
      update: mock((_userId: string, patch: Record<string, unknown>) => ({
        activeTheme: null,
        colorMode: null,
        ...patch,
      })),
    };
    mockEvents = {
      dispatch: mock().mockResolvedValue(undefined),
    };
    stub(StateStore, mockState);
    stub(PluginManager, mockPm);
    stub(UserPreferencesService, mockPrefs);
    stub(EventSystem, mockEvents);
    app = TestApp.create(settingsRoutes, [withSession()]);
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

  // ─── Per-user theme preferences ──────────────────────────────────────────

  test('GET /api/settings/theme returns the user preference', async () => {
    mockPrefs.get.mockReturnValue({ activeTheme: 'custom-abc', colorMode: 'dark' });

    const res = await app.get<{ theme: string | null; mode: string }>('/api/settings/theme');

    expect(res.status).toBe(200);
    expect(mockPrefs.get).toHaveBeenCalledWith('user-1');
    expect(res.body).toEqual({ theme: 'custom-abc', mode: 'dark' });
  });

  test('GET /api/settings/theme defaults mode to system when unset', async () => {
    mockPrefs.get.mockReturnValue({ activeTheme: null, colorMode: null });

    const res = await app.get<{ theme: string | null; mode: string }>('/api/settings/theme');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: null, mode: 'system' });
  });

  test('PUT /api/settings/theme patches active theme only', async () => {
    const res = await app.put('/api/settings/theme', { theme: 'ocean' });

    expect(res.status).toBe(200);
    expect(mockPrefs.update).toHaveBeenCalledWith('user-1', { activeTheme: 'ocean' });
  });

  test('PUT /api/settings/theme patches color mode only', async () => {
    const res = await app.put('/api/settings/theme', { mode: 'dark' });

    expect(res.status).toBe(200);
    expect(mockPrefs.update).toHaveBeenCalledWith('user-1', { colorMode: 'dark' });
  });

  test('PUT /api/settings/theme rejects empty patch', async () => {
    const res = await app.put('/api/settings/theme', {});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockPrefs.update).not.toHaveBeenCalled();
  });

  // ─── Custom themes library ───────────────────────────────────────────────

  test('GET /api/settings/custom-themes returns every stored theme', async () => {
    const theme = makeTheme('alpha');
    mockState.listCustomThemes.mockReturnValue([theme]);

    const res = await app.get<{ themes: ThemeConfigType[] }>('/api/settings/custom-themes');

    expect(res.status).toBe(200);
    expect(res.body.themes).toHaveLength(1);
    expect(res.body.themes[0]?.id).toBe('alpha');
  });

  test('GET /api/settings/custom-themes/:id returns 404 when missing', async () => {
    mockState.getCustomTheme.mockReturnValue(null);

    const res = await app.get('/api/settings/custom-themes/missing');

    expect(res.status).toBe(404);
  });

  test('PUT /api/settings/custom-themes/:id upserts and broadcasts', async () => {
    const theme = makeTheme('alpha');
    mockState.upsertCustomTheme.mockReturnValue(theme);

    const res = await app.put(`/api/settings/custom-themes/${theme.id}`, theme);

    expect(res.status).toBe(200);
    expect(mockState.upsertCustomTheme).toHaveBeenCalledWith(theme);
    expect(mockEvents.dispatch).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/settings/custom-themes/:id rejects id mismatch', async () => {
    const theme = makeTheme('alpha');
    const res = await app.put('/api/settings/custom-themes/beta', theme);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockState.upsertCustomTheme).not.toHaveBeenCalled();
    expect(mockEvents.dispatch).not.toHaveBeenCalled();
  });

  test('DELETE /api/settings/custom-themes/:id broadcasts when removed', async () => {
    mockState.removeCustomTheme.mockReturnValue(true);

    const res = await app.delete('/api/settings/custom-themes/alpha');

    expect(res.status).toBe(200);
    expect(mockState.removeCustomTheme).toHaveBeenCalledWith('alpha');
    expect(mockEvents.dispatch).toHaveBeenCalledTimes(1);
  });

  test('DELETE /api/settings/custom-themes/:id skips event when absent', async () => {
    mockState.removeCustomTheme.mockReturnValue(false);

    const res = await app.delete('/api/settings/custom-themes/missing');

    expect(res.status).toBe(200);
    expect(mockEvents.dispatch).not.toHaveBeenCalled();
  });
});
