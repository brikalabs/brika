/**
 * Sensors family: the measurement clusters (temperature, humidity, occupancy,
 * illuminance, booleanState/contact).
 *
 * The family is composed LAST among reader families on purpose: a standalone
 * temperature measurement overwrites a thermostat's local temperature, and
 * the sensor classification hints (priority 80) only apply when no
 * controllable family already claimed the endpoint (many devices carry a side
 * sensor next to their primary function).
 */

import { BooleanStateClient } from '@matter/main/behaviors/boolean-state';
import { IlluminanceMeasurementClient } from '@matter/main/behaviors/illuminance-measurement';
import { OccupancySensingClient } from '@matter/main/behaviors/occupancy-sensing';
import { RelativeHumidityMeasurementClient } from '@matter/main/behaviors/relative-humidity-measurement';
import { TemperatureMeasurementClient } from '@matter/main/behaviors/temperature-measurement';
import type { DeviceFamily } from '../types';

export const sensors: DeviceFamily = {
  id: 'sensors',
  deviceTypeIds: {
    0x0107: 'sensor', // Occupancy Sensor
    0x0106: 'sensor', // Light Sensor
    0x0302: 'sensor', // Temperature Sensor
    0x0305: 'sensor', // Humidity Sensor
    0x0015: 'sensor', // Contact Sensor
    0x0076: 'sensor', // Smoke/CO Alarm
    0x0510: 'sensor', // Electrical Sensor
    0x0850: 'sensor', // Contact Sensor
  },
  clusters: [
    {
      id: 'temperatureMeasurement',
      read: (ep, state) => {
        const temperature = ep.maybeStateOf(TemperatureMeasurementClient)?.measuredValue;
        if (temperature !== null && temperature !== undefined) {
          state.temperature = Number(temperature) / 100;
        }
      },
      classify: { type: 'sensor', keys: ['temperature'], priority: 80 },
    },
    {
      id: 'relativeHumidityMeasurement',
      read: (ep, state) => {
        const humidity = ep.maybeStateOf(RelativeHumidityMeasurementClient)?.measuredValue;
        if (humidity !== null && humidity !== undefined) {
          state.humidity = Number(humidity) / 100;
        }
      },
      classify: { type: 'sensor', keys: ['humidity'], priority: 80 },
    },
    {
      id: 'occupancySensing',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(OccupancySensingClient);
        if (!cs) {
          return;
        }
        state.occupied = Boolean(cs.occupancy?.occupied);
      },
      classify: { type: 'sensor', keys: ['occupied'], priority: 80 },
    },
    {
      id: 'illuminanceMeasurement',
      read: (ep, state) => {
        const illuminance = ep.maybeStateOf(IlluminanceMeasurementClient)?.measuredValue;
        if (illuminance !== null && illuminance !== undefined) {
          state.illuminance = Number(illuminance);
        }
      },
      classify: { type: 'sensor', keys: ['illuminance'], priority: 80 },
    },
    {
      id: 'booleanState',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(BooleanStateClient);
        if (!cs) {
          return;
        }
        state.contact = Boolean(cs.stateValue);
      },
      classify: { type: 'sensor', keys: ['contact'], priority: 80 },
    },
  ],
};
