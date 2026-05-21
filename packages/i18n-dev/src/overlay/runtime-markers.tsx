import { useEffect, useState } from 'react';
import type { RuntimeEntry } from './hooks';
import { isSkippedParent, observeBodyMutations, openInEditor } from './primitives';
import { getMergedKeyUsage, trackedTranslations } from './store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuntimeMarker {
  key: string;
  namespace: string;
  rect: DOMRect;
  /** First known source location for this key (file:line), or `null`. */
  source: string | null;
}

// ─── DOM scanner ────────────────────────────────────────────────────────────

/**
 * Build a lookup of rendered text → RuntimeEntry for missing keys.
 *
 * Uses two strategies:
 * 1. Cross-reference `trackedTranslations` (captured by the t() wrapper) with
 *    the known missing-key set — this finds the actual rendered fallback text.
 * 2. Fall back to matching the raw key strings directly in the DOM, since
 *    i18next's default fallback is the key itself.
 */
function buildMissingTextLookup(entries: RuntimeEntry[]): Map<string, RuntimeEntry> {
  const missingIds = new Set<string>();
  const byId = new Map<string, RuntimeEntry>();
  for (const entry of entries) {
    const id = `${entry.namespace}:${entry.key}`;
    missingIds.add(id);
    missingIds.add(entry.key);
    byId.set(id, entry);
    byId.set(entry.key, entry);
  }

  const lookup = new Map<string, RuntimeEntry>();

  // Strategy 1: use trackedTranslations to find the actual rendered text
  for (const [renderedText, i18nKey] of trackedTranslations) {
    if (missingIds.has(i18nKey)) {
      const entry = byId.get(i18nKey);
      if (entry) {
        lookup.set(renderedText, entry);
      }
    }
  }

  // Strategy 2: also match the raw key strings (i18next default fallback)
  for (const entry of entries) {
    lookup.set(entry.key, entry);
    lookup.set(`${entry.namespace}:${entry.key}`, entry);
  }

  return lookup;
}

/** Find matching entry by exact match, then substring match. */
function matchEntry(txt: string, lookup: Map<string, RuntimeEntry>): RuntimeEntry | undefined {
  const exact = lookup.get(txt);
  if (exact) {
    return exact;
  }
  for (const [text, entry] of lookup) {
    if (txt.includes(text)) {
      return entry;
    }
  }
  return undefined;
}

function pickPrimarySource(qualifiedKey: string): string | null {
  const usages = getMergedKeyUsage(qualifiedKey);
  const head = usages[0];
  return head ? `${head.file}:${head.line}` : null;
}

function buildMarker(parent: Element, entry: RuntimeEntry): RuntimeMarker {
  const qualifiedKey = `${entry.namespace}:${entry.key}`;
  return {
    key: entry.key,
    namespace: entry.namespace,
    rect: parent.getBoundingClientRect(),
    source: pickPrimarySource(qualifiedKey),
  };
}

function scanForMissingKeys(entries: RuntimeEntry[]): RuntimeMarker[] {
  if (entries.length === 0) {
    return [];
  }

  const lookup = buildMissingTextLookup(entries);
  const found: RuntimeMarker[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  for (let raw = walker.nextNode(); raw !== null; raw = walker.nextNode()) {
    if (!(raw instanceof Text)) {
      continue;
    }
    const node = raw;
    const txt = node.textContent?.trim();
    if (!txt) {
      continue;
    }
    const parent = node.parentElement;
    if (isSkippedParent(parent) || seen.has(parent)) {
      continue;
    }

    const entry = matchEntry(txt, lookup);
    if (entry) {
      seen.add(parent);
      found.push(buildMarker(parent, entry));
    }
  }
  return found;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

function markersEqual(a: readonly RuntimeMarker[], b: readonly RuntimeMarker[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) {
      return false;
    }
    if (
      x.key !== y.key ||
      x.namespace !== y.namespace ||
      x.source !== y.source ||
      x.rect.top !== y.rect.top ||
      x.rect.left !== y.rect.left ||
      x.rect.width !== y.rect.width ||
      x.rect.height !== y.rect.height
    ) {
      return false;
    }
  }
  return true;
}

export function useRuntimeMarkers(entries: RuntimeEntry[], enabled: boolean): RuntimeMarker[] {
  const [markers, setMarkers] = useState<RuntimeMarker[]>([]);

  useEffect(() => {
    if (!enabled || entries.length === 0) {
      setMarkers((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    function run() {
      setMarkers((prev) => {
        const next = scanForMissingKeys(entries);
        return markersEqual(prev, next) ? prev : next;
      });
    }

    run();

    const obs = observeBodyMutations(run);

    const onScroll = () => requestAnimationFrame(run);
    globalThis.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', onScroll);

    return () => {
      obs.disconnect();
      globalThis.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', onScroll);
    };
  }, [entries, enabled]);

  return markers;
}

// ─── Overlay Component ──────────────────────────────────────────────────────

function MarkerBadge({ marker }: Readonly<{ marker: RuntimeMarker }>) {
  const hasSource = marker.source !== null;

  return (
    <div>
      {/* Dashed red outline around the element */}
      <div
        className="pointer-events-none fixed z-[2147483645] rounded-sm"
        style={{
          top: marker.rect.top - 2,
          left: marker.rect.left - 2,
          width: marker.rect.width + 4,
          height: marker.rect.height + 4,
          border: '1.5px dashed rgba(239,68,68,.6)',
          background: 'rgba(239,68,68,.04)',
        }}
      />
      {/* Badge above the element */}
      <button
        type="button"
        onClick={hasSource ? () => openInEditor(marker.source ?? '') : undefined}
        className={`fixed z-[2147483646] flex max-w-[400px] items-center gap-1.5 truncate rounded-md border-none px-1.5 py-0.5 font-mono text-[9px] leading-tight shadow-md ${
          hasSource ? 'cursor-pointer hover:brightness-110' : 'pointer-events-none'
        }`}
        style={{
          top: Math.max(0, marker.rect.top - 22),
          left: marker.rect.left,
          background: 'rgba(220,38,38,.92)',
          color: '#fff',
          backdropFilter: 'blur(4px)',
        }}
        title={hasSource ? `Open ${marker.source} in editor` : undefined}
      >
        <span className="truncate">
          {marker.namespace}:{marker.key}
        </span>
        {marker.source && <span className="truncate text-[8px] opacity-70">{marker.source}</span>}
      </button>
    </div>
  );
}

export function RuntimeMarkersOverlay({ markers }: Readonly<{ markers: RuntimeMarker[] }>) {
  if (markers.length === 0) {
    return null;
  }

  return (
    <>
      {markers.map((m, i) => (
        <MarkerBadge key={`${m.namespace}:${m.key}-${i}`} marker={m} />
      ))}
    </>
  );
}
