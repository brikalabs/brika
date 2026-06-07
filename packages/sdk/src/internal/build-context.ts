/**
 * Build-time SDK context for `brika build`.
 *
 * The collector imports plugin server modules (blocks, sparks, brick
 * descriptors) to run their `define*` calls. Some of those reach `getContext()`
 * at import time, e.g. `defineOAuth` registers its routes immediately, which
 * throws without the hub prelude. `installBuildContext()` installs a no-op stub
 * prelude bridge so those calls succeed and do nothing, letting collection
 * proceed. It is the build-tool analogue of the hub prelude; nothing it returns
 * feeds the manifest, which is read from the collector sink.
 */

import { Channel } from '@brika/ipc';
import { PRELUDE_BRAND, type PreludeBridge } from '../bridge';

const noop = (): undefined => undefined;
const unsubscribe = (): (() => void) => () => undefined;

/**
 * Install a no-op prelude bridge so build-time imports that call `getContext()`
 * do not throw. Idempotent, and a no-op when a real prelude is already present.
 */
export function installBuildContext(): void {
  if (typeof process.send !== 'function') {
    process.send = () => true;
  }
  const existing = globalThis.__brika_ipc;
  if (existing && PRELUDE_BRAND in existing) {
    return;
  }
  const bridge: PreludeBridge = {
    [PRELUDE_BRAND]: true,
    channel: new Channel({ send: () => undefined }),
    start: noop,
    log: noop,
    capture: noop,
    getManifest: () => ({ name: 'brika-build', version: '0.0.0' }),
    getPluginRootDirectory: () => process.cwd(),
    getPluginUid: () => undefined,
    onInit: unsubscribe,
    onStop: unsubscribe,
    onUninstall: unsubscribe,
    getPreferences: () => ({}),
    onPreferencesChange: unsubscribe,
    updatePreference: noop,
    definePreferenceOptions: noop,
    registerAction: noop,
    registerRoute: noop,
    registerBlock: (block) => ({ id: block.id }),
    registerSpark: noop,
    emitSpark: noop,
    subscribeSpark: unsubscribe,
    registerBrickType: noop,
    setBrickData: noop,
    onBrickConfigChange: unsubscribe,
    getLocation: () => Promise.resolve(null),
    getTimezone: () => Promise.resolve(null),
    getSecret: () => Promise.resolve(null),
    setSecret: () => Promise.resolve(undefined),
    deleteSecret: () => Promise.resolve(false),
  };
  globalThis.__brika_ipc = bridge;
}
