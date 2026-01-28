/**
 * HTTP Client configuration
 *
 * HttpClient is automatically created as a singleton by the DI container
 * using the @singleton() decorator with default production settings.
 *
 * Default configuration:
 * - Timeout: 30 seconds
 * - Cache: MemoryCache (in-memory caching)
 * - Retry: 3 attempts with exponential backoff
 */

/**
 * Configure HttpClient (no-op - configuration is built-in)
 *
 * The HttpClient is automatically configured with production-ready defaults.
 * To customize configuration for testing, use container.registerInstance().
 */
export function configureHttpClient(): void {
  // HttpClient is auto-configured via @singleton() decorator
  // No manual setup required
}
