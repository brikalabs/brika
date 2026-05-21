/** DOM tags whose text content is never user-facing translation copy. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
]);

export function isSkippedParent(el: Element | null): el is null {
  if (!el) {
    return true;
  }
  return el.closest('#i18n-dev-root') !== null || SKIP_TAGS.has(el.tagName);
}

/**
 * Coalesces mutations via `requestAnimationFrame` and ignores changes that
 * originate inside the overlay's own root — without that filter, every marker
 * re-render would re-trigger the observer, which would re-render markers, ad
 * infinitum. Caller owns `.disconnect()`.
 */
export function observeBodyMutations(callback: () => void): MutationObserver {
  let pending = false;
  const obs = new MutationObserver((mutations) => {
    let externalChange = false;
    for (const m of mutations) {
      const target = m.target;
      const el = target instanceof Element ? target : target.parentElement;
      if (el && el.closest('#i18n-dev-root') === null) {
        externalChange = true;
        break;
      }
    }
    if (!externalChange || pending) {
      return;
    }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      callback();
    });
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  return obs;
}

export function openInEditor(source: string) {
  // POST (not GET): spawning an editor is a state-changing action; using POST
  // matches the server-side method check and prevents cross-origin drive-by
  // requests (`<img src>` / prefetch) from reaching the endpoint.
  fetch(`/__open-in-editor?file=${encodeURIComponent(source)}`, {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => undefined);
}
