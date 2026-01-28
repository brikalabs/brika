/**
 * Testing Types
 */

// biome-ignore lint/suspicious/noExplicitAny: Required for generic constructors
export type Constructor<T = unknown> = new (...args: any[]) => T;

/**
 * Deep partial type - allows nested partial objects.
 * Used for stub overrides where you only need to specify some properties.
 * Note: Functions are kept as-is to avoid excessive type instantiation depth.
 */
export type DeepPartial<T> = T extends object
  ? T extends (...args: unknown[]) => unknown
    ? T
    : { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
