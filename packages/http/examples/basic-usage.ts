/**
 * Basic usage examples for @brika/http
 */

import { inject, singleton } from '@brika/di';
import { HttpClient, MemoryCache } from '@brika/http';

// Example 1: Simple GET request
async function simpleGet() {
  const client = new HttpClient();

  const response = await client.get<{ uuid: string }>('https://httpbin.org/uuid').send();

  console.log('UUID:', response.data.uuid);
}

// Example 2: Request with caching
async function cachedRequest() {
  const client = new HttpClient({
    cache: new MemoryCache(),
  });

  // First call - hits the API
  const response1 = await client
    .get('https://registry.npmjs.org/-/v1/search')
    .params({ text: 'brika', size: '5' })
    .cache({ ttl: 60_000 }) // Cache for 1 minute
    .send();

  console.log('First call - cached:', response1.cached); // false

  // Second call - returns cached result
  const response2 = await client
    .get('https://registry.npmjs.org/-/v1/search')
    .params({ text: 'brika', size: '5' })
    .cache({ ttl: 60_000 })
    .send();

  console.log('Second call - cached:', response2.cached); // true
}

// Example 3: POST request with JSON body
async function postRequest() {
  const client = new HttpClient();

  const response = await client
    .post<{ json: unknown }>('https://httpbin.org/post')
    .json({ name: 'John Doe', email: 'john@example.com' })
    .send();

  console.log('Posted data:', response.data.json);
}

// Example 4: Using with DI
@singleton()
class UserService {
  readonly #http = inject(HttpClient);

  async getUser(id: string) {
    return this.#http
      .get<{ id: string; name: string }>(`https://api.example.com/users/${id}`)
      .cache({ ttl: 300_000 }) // Cache for 5 minutes
      .data(); // Returns only the data, not the full response
  }

  async createUser(name: string, email: string) {
    return this.#http.post('https://api.example.com/users').json({ name, email }).data();
  }
}

// Example 5: Advanced configuration
async function advancedConfig() {
  const client = new HttpClient({
    baseUrl: 'https://api.example.com',
    timeout: 30_000,
    cache: new MemoryCache(),
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
    },
    headers: {
      'User-Agent': 'MyApp/1.0',
    },
  });

  // All requests will use the base URL and default headers
  const response = await client.get('/users').params({ limit: '10' }).cache({ ttl: 60_000 }).send();

  console.log('Users:', response.data);
}

// Example 6: Error handling
async function errorHandling() {
  const client = new HttpClient();

  try {
    await client.get('https://httpbin.org/status/404').send();
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    }
  }
}

// Run all examples
async function runExamples() {
  console.log('\n=== Example 1: Simple GET ===');
  await simpleGet();

  console.log('\n=== Example 2: Cached Request ===');
  await cachedRequest();

  console.log('\n=== Example 3: POST Request ===');
  await postRequest();

  console.log('\n=== Example 5: Advanced Config ===');
  // await advancedConfig() // Requires real API

  console.log('\n=== Example 6: Error Handling ===');
  await errorHandling();

  console.log('\n✅ All examples completed!');
}

// Uncomment to run:
// await runExamples()
