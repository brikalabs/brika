/**
 * Light family: onOff, levelControl, and colorControl clusters.
 *
 * ColorControl is feature-gated in matter.js (its client isn't barrel-exported
 * and its members depend on the device's color features), so its state and
 * commands go through the generic string behavior-id surface: the same cached
 * state view, just stringly typed.
 */

import { z } from '@brika/sdk/schema';
import { LevelControlClient } from '@matter/main/behaviors/level-control';
import { OnOffClient } from '@matter/main/behaviors/on-off';
import { commandArgs, type DeviceFamily, percentArg } from '../types';

export const light: DeviceFamily = {
  id: 'light',
  deviceTypeIds: {
    0x0100: 'light', // On/Off Light
    0x0101: 'light', // Dimmable Light
    0x010c: 'light', // Color Temperature Light
    0x010d: 'light', // Extended Color Light
  },
  clusters: [
    {
      id: 'onOff',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(OnOffClient);
        if (!cs) {
          return;
        }
        state.on = cs.onOff;
      },
      classify: { type: 'light', keys: ['on'], priority: 20 },
      commands: [
        { name: 'on', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).on() },
        { name: 'off', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).off() },
        { name: 'toggle', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).toggle() },
      ],
    },
    {
      id: 'levelControl',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(LevelControlClient);
        if (!cs) {
          return;
        }
        const level = cs.currentLevel ?? 0;
        state.brightness = Math.round((Number(level) / 254) * 100);
      },
      classify: { type: 'light', keys: ['brightness'], priority: 20 },
      commands: [
        {
          name: 'setBrightness',
          when: 'brightness',
          args: commandArgs(
            z.object({
              brightness: percentArg.optional(),
              // Legacy alias: some callers still send { level } in percent.
              level: percentArg.optional(),
            }),
            '{ "brightness": "0-100" }',
            (parsed) => {
              const pct = parsed.brightness ?? parsed.level ?? 100;
              return { level: String(Math.round((pct / 100) * 254)) };
            }
          ),
          execute: (ep, args) =>
            ep.commandsOf(LevelControlClient).moveToLevel({
              level: Number(args.level ?? 254),
              transitionTime: 10, // 1 second
              optionsMask: { coupleColorTempToLevel: false, executeIfOff: true },
              optionsOverride: { coupleColorTempToLevel: false, executeIfOff: true },
            }),
        },
      ],
    },
    {
      id: 'colorControl',
      read: (ep, state) => {
        const colorState = ep.maybeStateOf('colorControl');
        if (!colorState) {
          return;
        }
        state.colorMode = colorState.colorMode;
        if (colorState.currentHue !== null) {
          state.hue = Math.round((Number(colorState.currentHue) / 254) * 360);
        }
        if (colorState.currentSaturation !== null) {
          state.saturation = Math.round((Number(colorState.currentSaturation) / 254) * 100);
        }
        if (colorState.colorTemperatureMireds !== null) {
          state.colorTempMireds = Number(colorState.colorTemperatureMireds);
        }
      },
      commands: [
        {
          name: 'setColorTemp',
          when: 'colorTempMireds',
          args: commandArgs(
            z.object({
              kelvin: z.coerce.number().min(1000).max(10000).optional(),
              mireds: z.coerce.number().min(100).max(1000).optional(),
            }),
            '{ "kelvin": "1000-10000" } or { "mireds": "100-1000" }',
            (parsed) => {
              const mireds =
                parsed.kelvin === undefined
                  ? (parsed.mireds ?? 370)
                  : Math.round(1_000_000 / parsed.kelvin);
              return { mireds: String(mireds) };
            }
          ),
          execute: (ep, args) =>
            ep.commandsOf('colorControl').moveToColorTemperature({
              colorTemperatureMireds: Number(args.mireds ?? 370),
              transitionTime: 5,
              optionsMask: { executeIfOff: true },
              optionsOverride: { executeIfOff: true },
            }),
        },
        {
          name: 'setHueSaturation',
          when: 'hue',
          args: commandArgs(
            z.object({
              hue: z.coerce.number().min(0).max(360).default(0),
              saturation: percentArg.default(100),
            }),
            '{ "hue": "0-360", "saturation": "0-100" }',
            (parsed) => ({
              hue: String(Math.round((parsed.hue / 360) * 254)),
              saturation: String(Math.round((parsed.saturation / 100) * 254)),
            })
          ),
          execute: (ep, args) =>
            ep.commandsOf('colorControl').moveToHueAndSaturation({
              hue: Number(args.hue ?? 0),
              saturation: Number(args.saturation ?? 254),
              transitionTime: 5,
              optionsMask: { executeIfOff: true },
              optionsOverride: { executeIfOff: true },
            }),
        },
      ],
    },
  ],
};
