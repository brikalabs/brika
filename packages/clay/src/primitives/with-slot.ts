import { createElement, type ComponentProps, type ElementType, type FC } from 'react';

/**
 * Wrap a component (or HTML tag) with a fixed `data-slot` attribute, returning
 * a thin pass-through that forwards all props. Used by Clay's primitives to
 * tag every Radix root/trigger/portal with its semantic slot name without
 * boilerplate per-component wrapper functions.
 */
export function withSlot<T extends ElementType>(Comp: T, slot: string): FC<ComponentProps<T>> {
  const Wrapped = (props: ComponentProps<T>) =>
    createElement(Comp, { 'data-slot': slot, ...(props as object) });
  Wrapped.displayName = slot;
  return Wrapped;
}
