/**
 * @brika/auth/client
 *
 * Client-side authentication module.
 * Use this to make HTTP calls to your auth API.
 *
 * @example
 * ```ts
 * import { AuthHttpClient } from '@brika/auth/client';
 *
 * const client = new AuthHttpClient({ baseUrl: 'http://localhost:3001' });
 * const { user } = await client.login({
 *   email: 'user@example.com',
 *   password: 'password123',
 * });
 * ```
 */

export { AuthHttpClient, type HttpClientOptions } from './http-client';
