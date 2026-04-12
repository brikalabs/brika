/**
 * Auto-injected by the i18n-dev Vite plugin.
 * Mounts the I18nDevOverlay into a Shadow DOM root for full CSS isolation.
 *
 * Uses dynamic imports so that any resolution failure
 * (React, overlay, i18next) is caught and shown visually.
 */
import cssText from './overlay-styles.css?inline';

function syncDarkMode(mount: HTMLElement) {
  function isDark(): boolean {
    const root = document.documentElement;
    if (root.classList.contains('dark') || root.dataset.mode === 'dark') {
      return true;
    }
    if (root.classList.contains('light') || root.dataset.mode === 'light') {
      return false;
    }
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function update() {
    mount.dataset.theme = isDark() ? 'dark' : 'light';
  }

  update();

  const obs = new MutationObserver(update);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-mode'],
  });

  const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', update);
}

try {
  const [{ createElement }, { createRoot }, { I18nDevOverlay }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./overlay'),
  ]);

  // Create shadow host (no styles — avoids breaking fixed positioning inside)
  const host = document.createElement('div');
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject processed Tailwind CSS into the shadow root (fully isolated)
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  shadow.adoptedStyleSheets = [sheet];

  // Mount point inside shadow — same ID the CSS targets
  const mount = document.createElement('div');
  mount.id = 'i18n-dev-root';
  shadow.appendChild(mount);

  // Keep dark/light mode in sync with the host page
  syncDarkMode(mount);

  createRoot(mount).render(createElement(I18nDevOverlay));
} catch (e) {
  console.error('[i18n-dev] Failed to mount overlay:', e);
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    padding: '6px 14px',
    background: '#dc2626',
    color: '#fff',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'ui-monospace, monospace',
    zIndex: '2147483647',
    cursor: 'pointer',
  });
  el.textContent = 'i18n-dev: load error';
  el.title = String(e);
  el.addEventListener('click', () => console.error('[i18n-dev]', e));
  document.body.appendChild(el);
}
