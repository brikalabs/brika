import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { settingsRoutes } from '@/runtime/http/routes/settings';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';

describe('settings routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockState: {
    getHubLocation: ReturnType<typeof mock>;
    setHubLocation: ReturnType<typeof mock>;
    getHubTimezone: ReturnType<typeof mock>;
    setHubTimezone: ReturnType<typeof mock>;
    applyTimezone: ReturnType<typeof mock>;
  };
  let mockPm: {
    broadcastTimezone: ReturnType<typeof mock>;
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
    };
    mockPm = {
      broadcastTimezone: mock(),
    };
    stub(StateStore, mockState);
    stub(PluginManager, mockPm);
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
});
