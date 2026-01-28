/**
 * @brika/testing - Testing utilities for mocking Bun APIs
 *
 * @example
 * ```ts
 * import { useBunMock } from '@brika/testing';
 *
 * describe('MyService', () => {
 *   const bun = useBunMock(); // Auto lifecycle
 *
 *   test('reads config', async () => {
 *     bun.fs({ '/config.json': { port: 3000 } }).apply();
 *     expect(await Bun.file('/config.json').json()).toEqual({ port: 3000 });
 *   });
 * });
 * ```
 */

export { BunMock, mockBun, useBunMock } from './mock-bun';
export { proxify } from './proxify';
