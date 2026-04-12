import i18next from 'i18next';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { isSkippedParent, observeBodyMutations } from './primitives';
import { getStoreData, trackedTranslations, walkStoreEntries } from './store';

// ─── Variable display (uses i18next's own interpolator) ─────────────────────

interface I18nInterpolator {
  interpolate(str: string, data: object, lng: string, options: object): string;
}

interface TemplatePart {
  type: 'text' | 'var';
  content: string;
}

const SENTINEL = '\0';

function splitTemplate(value: string): TemplatePart[] {
  const interpolator = (i18next.services as unknown as Record<string, unknown> | undefined)
    ?.interpolator as I18nInterpolator | undefined;
  if (!interpolator) {
    return [{ type: 'text', content: value }];
  }

  const vars: string[] = [];
  const data = new Proxy({} as Record<string, string>, {
    get(_, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      vars.push(prop);
      return `${SENTINEL}${prop}${SENTINEL}`;
    },
    has() {
      return true;
    },
  });

  const interpolated = interpolator.interpolate(value, data, i18next.language, {
    interpolation: { escapeValue: false },
  });

  if (vars.length === 0) {
    return [{ type: 'text', content: value }];
  }

  const varSet = new Set(vars);
  const parts: TemplatePart[] = [];
  for (const segment of interpolated.split(SENTINEL)) {
    if (segment.length === 0) {
      continue;
    }
    if (varSet.has(segment)) {
      parts.push({ type: 'var', content: `{{${segment}}}` });
    } else {
      parts.push({ type: 'text', content: segment });
    }
  }
  return parts;
}

export function VariableHighlight({ value }: Readonly<{ value: string }>): ReactNode {
  const parts = splitTemplate(value);
  if (parts.length <= 1 && parts[0]?.type === 'text') {
    return <>{value}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'var' ? (
          <span
            key={`var-${part.content}-${i}`}
            className="mx-0.5 inline-block rounded bg-indigo-500/20 px-1 font-semibold text-indigo-300"
          >
            {part.content}
          </span>
        ) : (
          <span key={`txt-${part.content.length}-${i}`}>{part.content}</span>
        )
      )}
    </>
  );
}

// ─── Highlight Mode ─────────────────────────────────────────────────────────

const HL_KEY = 'data-i18n-key';
const HL_RAW = 'data-i18n-raw';
function buildStoreMap(): Map<string, string> {
  const map = new Map<string, string>();
  const resources = getStoreData();
  if (!resources) {
    return map;
  }
  walkStoreEntries(resources, (ns, key, value) => {
    if (value.length > 0) {
      map.set(value, `${ns}:${key}`);
    }
  });
  return map;
}

function isTranslatable(text: string): boolean {
  if (text.length < 2) {
    return false;
  }
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return false;
  }
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      return true;
    }
    if (code >= 0xc0) {
      return true;
    }
  }
  return false;
}

/** State produced by the highlight scanner for React-driven overlay/tooltip. */
export interface HighlightHover {
  isKey: boolean;
  label: string;
  rect: DOMRect;
  mouseX: number;
}

const HL_CSS = `[${HL_KEY}],[${HL_RAW}]{cursor:crosshair!important}`;

/**
 * Hook that manages highlight scanning, attribute tagging, and hover tracking.
 * Returns the current hover state so React components can render overlay + tooltip.
 */
export function useHighlightMode(active: boolean): HighlightHover | null {
  const [hover, setHover] = useState<HighlightHover | null>(null);

  useEffect(() => {
    if (!active) {
      setHover(null);
      return;
    }

    const storeMap = buildStoreMap();

    const css = document.createElement('style');
    css.id = '__i18d_hl';
    css.textContent = HL_CSS;
    document.head.appendChild(css);

    function matchText(txt: string): string | undefined {
      return trackedTranslations.get(txt) ?? storeMap.get(txt);
    }

    function clearAttrs() {
      for (const el of document.querySelectorAll(`[${HL_KEY}],[${HL_RAW}]`)) {
        el.removeAttribute(HL_KEY);
        el.removeAttribute(HL_RAW);
      }
    }

    function tagTextNode(node: Text) {
      const txt = node.textContent?.trim();
      if (!txt) {
        return;
      }
      const parent = node.parentElement;
      if (isSkippedParent(parent)) {
        return;
      }
      const key = matchText(txt);
      if (key) {
        parent.setAttribute(HL_KEY, key);
      } else if (isTranslatable(txt)) {
        parent.setAttribute(HL_RAW, txt);
      }
    }

    function scan() {
      clearAttrs();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        tagTextNode(node);
      }
    }

    scan();

    const obs = observeBodyMutations(scan);

    let hoveredEl: Element | null = null;
    let lastMouseX = 0;

    function updateHover(el: Element, mouseX: number) {
      const isKey = el.hasAttribute(HL_KEY);
      const label = (isKey ? el.getAttribute(HL_KEY) : el.getAttribute(HL_RAW)) ?? '';
      setHover({ isKey, label, rect: el.getBoundingClientRect(), mouseX });
    }

    function onMove(e: MouseEvent) {
      const t = (e.target as Element)?.closest?.(`[${HL_KEY}],[${HL_RAW}]`);
      if (t) {
        hoveredEl = t;
        lastMouseX = e.clientX;
        updateHover(t, e.clientX);
      } else {
        hoveredEl = null;
        setHover(null);
      }
    }

    function onScroll() {
      if (hoveredEl) {
        updateHover(hoveredEl, lastMouseX);
      }
    }

    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target.closest(`[${HL_KEY}]`) : null;
      if (!target) {
        return;
      }
      const key = target.getAttribute(HL_KEY);
      if (key) {
        e.preventDefault();
        e.stopPropagation();
        globalThis.dispatchEvent(new CustomEvent('i18n-dev:navigate', { detail: key }));
      }
    }

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    globalThis.addEventListener('scroll', onScroll, true);

    return () => {
      obs.disconnect();
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      globalThis.removeEventListener('scroll', onScroll, true);
      css.remove();
      clearAttrs();
      setHover(null);
    };
  }, [active]);

  return hover;
}

/** Floating rectangle that highlights the hovered element (DevTools-style). */
export function HighlightOverlay({ hover }: Readonly<{ hover: HighlightHover }>) {
  const pad = 3;
  const { rect, isKey } = hover;
  return (
    <div
      className="pointer-events-none fixed z-[2147483646] rounded-sm transition-[top,left,width,height] duration-75"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        background: isKey ? 'rgba(99,102,241,.08)' : 'rgba(239,68,68,.06)',
        border: isKey ? '1.5px solid rgba(129,140,248,.55)' : '1.5px solid rgba(248,113,113,.45)',
      }}
    />
  );
}

/** Compact tooltip that sits above the hovered element. */
export function HighlightTooltip({ hover }: Readonly<{ hover: HighlightHover }>) {
  const ref = useRef<HTMLDivElement>(null);
  const { rect, isKey, label, mouseX } = hover;

  const tipWidth = ref.current?.offsetWidth ?? 200;
  const x = Math.min(mouseX + 12, globalThis.innerWidth - tipWidth - 8);
  const tipHeight = ref.current?.offsetHeight ?? 24;
  const y = rect.top - tipHeight - 6;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[2147483647] max-w-[380px] overflow-hidden truncate rounded-md font-mono text-[11px] leading-[1.4] shadow-lg"
      style={{
        top: y,
        left: x,
        padding: '4px 8px',
        background: 'rgba(15,15,25,.88)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
      }}
    >
      <span
        className="mr-1 inline-block size-1.5 rounded-full align-middle"
        style={{ background: isKey ? '#818cf8' : '#f87171' }}
      />
      <span style={{ color: isKey ? '#c7d2fe' : '#fca5a5' }}>{label}</span>
    </div>
  );
}
