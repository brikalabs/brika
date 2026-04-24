'use client';

import * as React from 'react';

import { cn } from '../../primitives/cn';

// ─── Constants ───────────────────────────────────────────────────────────────

const ITEM_ATTR = 'data-overflow-item';

// ─── Measurement helpers ──────────────────────────────────────────────────────

/** Cache the measured width of each overflow item element. */
function cacheItemWidths(els: NodeListOf<HTMLElement>, cache: Map<string, number>): void {
  for (const el of els) {
    const id = el.getAttribute(ITEM_ATTR);
    if (id) {
      cache.set(id, el.offsetWidth);
    }
  }
}

/** Count how many item elements fit before overflowing the container. */
function countVisibleItems(els: NodeListOf<HTMLElement>, containerRight: number): number {
  let visible = 0;
  for (const el of els) {
    if (el.getBoundingClientRect().right <= containerRight + 1) {
      visible++;
    } else {
      break;
    }
  }
  return visible;
}

// ─── useOverflowList ─────────────────────────────────────────────────────────

interface UseOverflowListOptions<T> {
  /** The full list of items. */
  items: T[];
  /** Extract a unique string key from each item. */
  getKey: (item: T) => string;
  /** Key of the currently active item — always kept visible even when it
   *  would otherwise overflow. */
  activeKey?: string;
  /** Extra reactive values that should trigger re-measurement. */
  deps?: React.DependencyList;
}

interface UseOverflowListReturn<T> {
  /** Attach to the `OverflowListContent` container. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Items that fit within the container. */
  visible: T[];
  /** Items that don't fit. */
  overflow: T[];
  /** Shorthand for `overflow.length > 0`. */
  hasOverflow: boolean;
  /** Set `.current = true` to pause measurement (e.g. during drag). */
  pauseRef: React.RefObject<boolean>;
}

function useOverflowList<T>({
  items,
  getKey,
  activeKey,
  deps = [],
}: UseOverflowListOptions<T>): UseOverflowListReturn<T> {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widthCache = React.useRef(new Map<string, number>());
  const pauseRef = React.useRef(false);

  // Keep latest values in refs so ResizeObserver always sees them.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const getKeyRef = React.useRef(getKey);
  getKeyRef.current = getKey;

  const [overflowCount, setOverflowCount] = React.useState(0);

  // ── Measure visible items (runs before paint — no flash) ───────────────
  React.useLayoutEffect(() => {
    if (pauseRef.current) {
      return;
    }
    const container = containerRef.current;
    if (!container || items.length === 0) {
      return;
    }

    const containerRight = container.getBoundingClientRect().right;
    const els = container.querySelectorAll<HTMLElement>(`[${ITEM_ATTR}]`);

    cacheItemWidths(els, widthCache.current);
    const visible = countVisibleItems(els, containerRight);

    setOverflowCount(Math.max(items.length - visible, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overflowCount, activeKey, ...deps]);

  // ── Resize: recompute from cached widths (pure math, no DOM reads) ─────
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    /** Count how many items fit within the available width using cached widths. Returns -1 if a cache miss is found. */
    function countFittingItems(
      currentItems: T[],
      key: (item: T) => string,
      available: number,
      gap: number
    ): number {
      let used = 0;
      let fits = 0;
      for (const item of currentItems) {
        const w = widthCache.current.get(key(item));
        if (w === undefined) {
          return -1; // cache miss
        }
        if (fits > 0) {
          used += gap;
        }
        used += w;
        if (used > available) {
          break;
        }
        fits++;
      }
      return fits;
    }

    const ro = new ResizeObserver(() => {
      if (pauseRef.current) {
        return;
      }
      const currentItems = itemsRef.current;
      const key = getKeyRef.current;
      if (currentItems.length === 0) {
        return;
      }

      const gap = Number.parseFloat(getComputedStyle(container).gap) || 0;
      const available = container.clientWidth;
      const fits = countFittingItems(currentItems, key, available, gap);

      if (fits < 0) {
        // Uncached item — show all so useLayoutEffect can measure
        setOverflowCount(0);
        return;
      }

      setOverflowCount(Math.max(currentItems.length - fits, 0));
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Clean stale cache entries ──────────────────────────────────────────
  React.useEffect(() => {
    const key = getKeyRef.current;
    const currentIds = new Set(items.map(key));
    for (const id of widthCache.current.keys()) {
      if (!currentIds.has(id)) {
        widthCache.current.delete(id);
      }
    }
  }, [items]);

  // ── Derive visible / overflow split ────────────────────────────────────
  const visibleCount = items.length - overflowCount;

  const { visible, overflow } = React.useMemo(() => {
    if (overflowCount === 0) {
      return {
        visible: items,
        overflow: [] as T[],
      };
    }

    const key = getKeyRef.current;

    if (activeKey !== null && activeKey !== undefined) {
      const activeIdx = items.findIndex((item) => key(item) === activeKey);
      if (activeIdx >= 0 && activeIdx >= visibleCount) {
        const vis = [...items.slice(0, visibleCount - 1), items[activeIdx]];
        const visKeys = new Set(vis.map(key));
        const ovf = items.filter((item) => !visKeys.has(key(item)));
        return {
          visible: vis,
          overflow: ovf,
        };
      }
    }

    return {
      visible: items.slice(0, visibleCount),
      overflow: items.slice(visibleCount),
    };
  }, [items, visibleCount, overflowCount, activeKey]);

  return {
    containerRef,
    visible,
    overflow,
    hasOverflow: overflow.length > 0,
    pauseRef,
  };
}

// ─── Styled components ───────────────────────────────────────────────────────

/** Outer flex container. */
function OverflowList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="overflow-list"
      className={cn('flex min-w-0 max-w-full items-center gap-1', className)}
      {...props}
    />
  );
}

/** Inner container — clips overflow items. Attach `containerRef` here. */
function OverflowListContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="overflow-list-content"
      className={cn('flex min-w-0 flex-1 items-center gap-1 overflow-hidden', className)}
      {...props}
    />
  );
}

/** Wrapper for each item — provides the measurement data-attribute. */
function OverflowListItem({
  className,
  itemId,
  ...props
}: React.ComponentProps<'div'> & {
  itemId: string;
}) {
  return (
    <div
      data-slot="overflow-list-item"
      {...{
        [ITEM_ATTR]: itemId,
      }}
      className={cn('shrink-0', className)}
      {...props}
    />
  );
}

/** Placeholder that always occupies layout space so the content container
 *  width stays stable. Set `active` to toggle visibility. */
function OverflowListIndicator({
  className,
  active = false,
  ...props
}: React.ComponentProps<'div'> & {
  active?: boolean;
}) {
  return (
    <div
      data-slot="overflow-list-indicator"
      className={cn('shrink-0', !active && 'invisible', className)}
      aria-hidden={!active || undefined}
      {...props}
    />
  );
}

export type { UseOverflowListOptions, UseOverflowListReturn };
export {
  OverflowList,
  OverflowListContent,
  OverflowListIndicator,
  OverflowListItem,
  useOverflowList,
};
