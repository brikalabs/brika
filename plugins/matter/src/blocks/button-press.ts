/**
 * "When Button Pressed" trigger block.
 *
 * The flagship simple trigger for physical remotes: pick a device, a button,
 * and a gesture from dropdowns, and the block fires exactly once per gesture
 * with the normalized press (short, long, double, triple, multi). All the raw
 * Matter switch-event choreography (initialPress/shortRelease/longPress/
 * multiPressComplete bursts) is collapsed by the controller's press tracker.
 *
 * Composed devices (a Hue dimmer/wall module) work whether the user picks the
 * named parent device or one of its "Parent button N" children.
 */

import { defineBlock, output, z } from '@brika/sdk';
import {
  getMatterController,
  type MatterButtonPress,
  MatterController,
} from '../matter-controller';
import { PRESS_TYPE_VALUES } from '../press-tracker';

/** Gesture dropdown choices: 'any' plus the normalized press vocabulary. */
const PRESS_CHOICES = ['any', ...PRESS_TYPE_VALUES] as const;

/**
 * True when a press belongs to the configured device, counting each gesture
 * exactly once. The controller emits every press twice for composed devices
 * (once for the button child, once re-emitted on the named parent), so a
 * naive "device or parent" match would double-fire when the parent is picked:
 * accept the button-device emission and skip the parent duplicate.
 */
function matchesConfiguredDevice(
  controller: MatterController,
  press: MatterButtonPress,
  configuredId: string
): boolean {
  const source = controller.getDevice(press.nodeId);
  if (source?.parentId === configuredId) {
    return true;
  }
  if (press.nodeId !== configuredId) {
    return false;
  }
  // Direct hit. If the configured device has button children, this emission
  // is the parent re-emission of a child press that already matched above.
  return !controller.getDevices().some((device) => device.parentId === configuredId);
}

export const buttonPress = defineBlock({
  id: 'button-press',
  meta: {
    name: 'When Button Pressed',
    description:
      'Fires once per button gesture (short, long, double or triple press) on a Matter switch or remote',
    category: 'trigger',
    icon: 'mouse-pointer-click',
    color: '#6366f1',
  },
  inputs: {},
  outputs: {
    pressed: output(
      z.object({
        nodeId: z.string(),
        name: z.string(),
        button: z.number(),
        press: z.string(),
        count: z.number(),
      }),
      { name: 'Pressed' }
    ),
  },
  config: z.object({
    nodeId: z.dynamicDropdown({
      label: 'Device',
      description: 'The Matter switch or remote to watch',
    }),
    button: z
      .enum(['any', '1', '2', '3', '4', '5', '6', '7', '8'])
      .default('any')
      .describe('Which physical button to watch'),
    press: z.enum(PRESS_CHOICES).default('any').describe('Which gesture to fire on'),
  }),
  run: ({ config, emit, start }) => {
    const controller = getMatterController();

    start<MatterButtonPress>((push) =>
      controller.onButtonPress((press) => {
        if (matchesConfiguredDevice(controller, press, config.nodeId)) {
          push(press);
        }
      })
    ).on((press) => {
      if (config.button !== 'any' && String(press.button) !== config.button) {
        return;
      }
      if (config.press !== 'any' && press.press !== config.press) {
        return;
      }
      emit('pressed', {
        nodeId: press.nodeId,
        name: press.name,
        button: press.button,
        press: press.press,
        count: press.count,
      });
    });
  },
});
