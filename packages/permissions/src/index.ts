import { createRegistry } from './registry';

/**
 * Permission registry.
 *
 * Each entry is one *family* — a single permission whose grant value carries
 * a per-capability scope (host allowlist, namespace list, binary list, …).
 * The actual scope schemas live with each capability spec in
 * `@brika/sdk/capabilities/<id>` so the data shape and the runtime
 * validation can never drift.
 *
 * Order here is the order rendered in the install/grant UI.
 */
export const { PERMISSIONS, PERMISSION_LIST, isValidPermission, filterValidPermissions } =
  createRegistry({
    // Network egress — net.fetch
    net: { icon: 'globe' },
    // Per-plugin keychain — secrets.get/set/delete
    secrets: { icon: 'key-round' },
    // Filesystem access outside the plugin's auto data dir — fs.read/write/exists
    fs: { icon: 'folder' },
    // Child process spawn under a strict binary allowlist — exec.spawn
    exec: { icon: 'terminal' },
    // Hub's stored location — location.get/timezone
    location: { icon: 'map-pin' },
    // Spark emit/subscribe — sparks.register/emit/subscribe/unsubscribe
    sparks: { icon: 'zap' },
    // Reactive block surface — blocks.register/emit/log
    blocks: { icon: 'box' },
    // Brick (UI) surface — bricks.registerType/pushData
    bricks: { icon: 'layout-grid' },
    // HTTP route registration — routes.register
    routes: { icon: 'route' },
    // Action registration — actions.register
    actions: { icon: 'play' },
    // Preference writes — prefs.set
    prefs: { icon: 'settings' },
  });

export type Permission = keyof typeof PERMISSIONS;
export type { PermissionDefinition } from './registry';
