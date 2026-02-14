import type { ActionHandler } from './registry';

/** Shared gap variant config for container cva definitions */
export const gapVariant = {
  sm: 'gap-1.5',
  md: 'gap-2.5',
  lg: 'gap-4',
} as const;

/** Shared interactive props for clickable brick elements (onClick, onKeyDown, role, tabIndex) */
export function clickableProps(
  onPress: unknown,
  onAction?: ActionHandler,
  payload?: Record<string, unknown>
) {
  if (!onPress) return {};
  const handler = () => onAction?.(String(onPress), payload);
  return {
    onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    },
    role: 'button' as const,
    tabIndex: 0,
  };
}
