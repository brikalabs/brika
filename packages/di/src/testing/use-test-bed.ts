/**
 * Hook-style TestBed helper with auto lifecycle management
 *
 * Call at describe level - automatically handles afterEach reset.
 *
 * @example
 * ```ts
 * import { useTestBed } from '@brika/di/testing';
 *
 * describe('MyService', () => {
 *   const di = useTestBed();
 *
 *   test('gets user', () => {
 *     di.stub(Logger);
 *     di.stub(UserService, { getUser: mock().mockReturnValue({ id: '1' }) });
 *
 *     const controller = di.get(UserController);
 *     expect(controller.getUser('1').id).toBe('1');
 *   });
 * });
 * ```
 */

import { TestBed } from './test-bed';

export function useTestBed() {
  const { afterEach } = require('bun:test');

  afterEach(() => {
    TestBed.reset();
  });

  return TestBed;
}
