/**
 * Service-worker lifecycle for the bootstrap.
 *
 * The browser's own SW lifecycle (`skipWaiting()` + `clients.claim()` in
 * `sw/sw.ts`) handles updates cleanly. The client side just needs to
 * register, wait for an active registration, and report whether we ended
 * up with a controller — no version sentinel, no reload loop, no retry
 * counter. `clearBootstrapState` is the user-triggered escape hatch wired
 * to the "Reset and reload" button on the error card.
 *
 * Every decision point logs to the console under `[brika-sw]` so a
 * "Browser not supported" outcome can be traced step-by-step in DevTools
 * without having to instrument blindly.
 */

const ASSET_CACHE_PREFIX = 'brika-assets-';
const READY_TIMEOUT_MS = 10_000;

const log = (...args: unknown[]): void => console.log('[brika-sw]', ...args);
const warn = (...args: unknown[]): void => console.warn('[brika-sw]', ...args);

export async function ensureServiceWorker(): Promise<boolean> {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  if (!supported) {
    warn('navigator.serviceWorker unavailable — SW APIs not supported in this context');
    return false;
  }
  log('start', {
    secureContext: typeof globalThis === 'undefined' ? false : globalThis.isSecureContext,
    href: typeof location === 'undefined' ? null : location.href,
    existingController: navigator.serviceWorker.controller?.scriptURL ?? null,
  });

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    log('register ok', {
      scope: reg.scope,
      installing: reg.installing?.state ?? null,
      waiting: reg.waiting?.state ?? null,
      active: reg.active?.state ?? null,
    });
  } catch (err) {
    warn('register threw — /sw.js failed to load or install', err);
    return false;
  }

  // Wire state-change listeners on whichever worker is currently transitioning
  // so the user can see install → activated (or install → redundant on a crash).
  const trackWorker = (label: string, worker: ServiceWorker | null): void => {
    if (!worker) {
      return;
    }
    log(`${label} initial state`, worker.state);
    worker.addEventListener('statechange', () => log(`${label} state →`, worker.state));
  };
  trackWorker('installing', reg.installing);
  trackWorker('waiting', reg.waiting);
  trackWorker('active', reg.active);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    log('controllerchange', {
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    });
  });

  // Kick the browser to refetch /sw.js. Best-effort; a network failure here
  // shouldn't abort registration. `.catch` (not try/await) so we don't block.
  reg.update().catch((err: unknown) => warn('reg.update() rejected (non-fatal)', err));

  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SW ready timeout')), READY_TIMEOUT_MS)
      ),
    ]);
    log('ready resolved');
  } catch (err) {
    warn(`ready did not resolve within ${READY_TIMEOUT_MS}ms`, err);
  }

  let controller = navigator.serviceWorker.controller;
  log('controller after ready', controller?.scriptURL ?? null);

  // Uncontrolled-but-active recovery. `clients.claim()` only runs from the SW's
  // `activate` handler, so a reload onto a previously-activated SW (or one with
  // DevTools "Bypass for network" enabled) lands as an uncontrolled page. Ask
  // the active worker to claim us via postMessage, then wait one `controllerchange`.
  if (!controller && reg.active) {
    log('uncontrolled but active worker present — requesting CLAIM');
    try {
      reg.active.postMessage({ type: 'CLAIM' });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', onChange);
          reject(new Error('controllerchange timeout after CLAIM'));
        }, 3_000);
        const onChange = (): void => {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', onChange);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onChange);
      });
      controller = navigator.serviceWorker.controller;
      log('controller after CLAIM', controller?.scriptURL ?? null);
    } catch (err) {
      warn('CLAIM round-trip failed', err);
    }
  }

  if (!controller) {
    warn(
      'no controller after ready + CLAIM — page is uncontrolled (DevTools "Bypass for network"? private/incognito? policy restriction?)'
    );
    return false;
  }
  return true;
}

export async function clearBootstrapState(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      log('clearBootstrapState: unregistering', regs.length, 'registration(s)');
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (err) {
      warn('clearBootstrapState: unregister failed (best effort)', err);
    }
  }
  if ('caches' in globalThis) {
    try {
      const names = await caches.keys();
      const targets = names.filter((n) => n.startsWith(ASSET_CACHE_PREFIX));
      log('clearBootstrapState: dropping caches', targets);
      await Promise.all(targets.map((n) => caches.delete(n)));
    } catch (err) {
      warn('clearBootstrapState: cache drop failed (best effort)', err);
    }
  }
}
