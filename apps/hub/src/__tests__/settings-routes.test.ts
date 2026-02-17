import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { StateStore } from '@/runtime/state/state-store';
import { settingsRoutes } from '@/runtime/http/routes/settings';

describe('settings routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockState: {
    getHubLocation: ReturnType<typeof mock>;
    setHubLocation: ReturnType<typeof mock>;
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
        timezone: 'America/Montreal',
      }),
      setHubLocation: mock().mockResolvedValue(undefined),
    };
    stub(StateStore, mockState);
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
      timezone: 'Europe/Paris',
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
});
