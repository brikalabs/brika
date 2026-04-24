import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names with conflict resolution.
 *
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (last-wins conflict resolution) so that a caller-supplied `className` can
 * safely override internal defaults without duplicate utilities surviving.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
