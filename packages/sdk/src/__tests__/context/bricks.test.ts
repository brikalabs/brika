import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupBricks } from '../../context/bricks';
import { createTestHarness } from './_test-utils';

describe('context/bricks', () => {
  const h = createTestHarness({
    bricks: [{ id: 'test-brick' }, { id: 'another-brick' }],
  });

  let bricks: ReturnType<typeof setupBricks>;

  beforeEach(() => {
    h.reset();
    bricks = setupBricks(h.core);
  });

  describe('registerBrickType', () => {
    test('sends IPC message for declared brick', () => {
      bricks.methods.registerBrickType({
        id: 'test-brick',
        families: ['sm', 'md'],
      });

      const msg = h.sentMessages.find((m) => m.name === 'registerBrickType');
      expect(msg).toBeDefined();
      expect((msg?.payload as { brickType: { id: string } }).brickType.id).toBe('test-brick');
    });

    test('throws for undeclared brick', () => {
      expect(() =>
        bricks.methods.registerBrickType({
          id: 'not-declared',
          families: ['sm'],
        })
      ).toThrow('Brick "not-declared" not in package.json');
    });
  });

  describe('setBrickData', () => {
    test('sends pushBrickData IPC message', () => {
      bricks.methods.setBrickData('test-brick', { value: 42 });

      const msg = h.sentMessages.find((m) => m.name === 'pushBrickData');
      expect(msg).toBeDefined();
      expect(msg?.payload).toEqual({
        brickTypeId: 'test-brick',
        data: { value: 42 },
      });
    });
  });

  describe('onBrickConfigChange', () => {
    test('registers handler and invokes on config update', () => {
      const handler = mock((_instanceId: string, _config: Record<string, unknown>) => {
        /* noop */
      });
      bricks.methods.onBrickConfigChange(handler);

      // Simulate hub sending updateBrickConfig
      h.triggerOn('updateBrickConfig', { instanceId: 'inst-1', config: { city: 'Zurich' } });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]).toEqual(['inst-1', { city: 'Zurich' }]);
    });

    test('returns unsubscribe function', () => {
      const handler = mock(() => {
        /* noop */
      });
      const unsub = bricks.methods.onBrickConfigChange(handler);

      unsub();
      h.triggerOn('updateBrickConfig', { instanceId: 'inst-2', config: {} });
      expect(handler).toHaveBeenCalledTimes(0);
    });

    test('handler errors are caught and logged', () => {
      bricks.methods.onBrickConfigChange(() => {
        throw new Error('boom');
      });

      h.triggerOn('updateBrickConfig', { instanceId: 'inst-3', config: {} });

      expect(h.logMessages.length).toBe(1);
      expect(h.logMessages[0]?.level).toBe('error');
    });
  });

  describe('stop', () => {
    test('clears all config change handlers', () => {
      const handler = mock(() => {
        /* noop */
      });
      bricks.methods.onBrickConfigChange(handler);

      bricks.stop();

      h.triggerOn('updateBrickConfig', { instanceId: 'inst-4', config: {} });
      expect(handler).toHaveBeenCalledTimes(0);
    });
  });
});
