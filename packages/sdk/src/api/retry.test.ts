import { describe, expect, test } from 'bun:test';
import { retry } from './retry';

describe('retry', () => {
  test('returns on first success without retrying', async () => {
    let calls = 0;
    const result = await retry(() => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries with backoff until success and passes the attempt number', async () => {
    const attempts: number[] = [];
    const result = await retry(
      (attempt) => {
        attempts.push(attempt);
        if (attempt < 3) {
          throw new Error('flaky');
        }
        return attempt;
      },
      { attempts: 3, backoffMs: 1 }
    );
    expect(result).toBe(3);
    expect(attempts).toEqual([1, 2, 3]);
  });

  test('throws the last error when every attempt fails', async () => {
    let calls = 0;
    await expect(
      retry(
        () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { attempts: 2, backoffMs: 1 }
      )
    ).rejects.toThrow('fail 2');
    expect(calls).toBe(2);
  });

  test('stops immediately when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      retry(
        () => {
          calls++;
          throw new Error('fatal');
        },
        { attempts: 5, backoffMs: 1, shouldRetry: () => false }
      )
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });
});
