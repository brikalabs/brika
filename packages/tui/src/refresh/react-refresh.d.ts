/**
 * `@types/react-refresh` types `injectIntoGlobalHook`'s arg as
 * `Window` (browser-centric). The function just attaches to whatever
 * object you hand it, so we widen to `object` for Bun/Node hosts.
 */

declare module 'react-refresh/runtime' {
  export function injectIntoGlobalHook(globalObject: object): void;
  export function performReactRefresh(): void;
  export function register(type: unknown, id: string): void;
  export function createSignatureFunctionForTransform(): <T>(type: T, ...rest: unknown[]) => T;
}
