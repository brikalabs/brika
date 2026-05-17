/** RNG helpers. `crypto.getRandomValues` keeps Sonar quiet about Math.random. */

export function rand(min: number, max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + ((buf[0] ?? 0) / 0x100000000) * (max - min);
}

export function pick<T>(arr: ReadonlyArray<T>): T {
  const item = arr[Math.floor(rand(0, arr.length))];
  if (item === undefined) {
    throw new Error('pick() on empty array');
  }
  return item;
}
