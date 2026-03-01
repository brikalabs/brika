import type { ActionHandler } from './registry';

/** Shared gap variant config for container cva definitions */
export const gapVariant = {
  sm: 'gap-1 @xs:gap-1.5 @md:gap-2',
  md: 'gap-1.5 @xs:gap-2.5 @md:gap-3.5',
  lg: 'gap-2.5 @xs:gap-4 @md:gap-5',
} as const;

/** Shared interactive props for clickable brick elements (onClick, onKeyDown, role, tabIndex) */
export function clickableProps(
  onPress: string | undefined,
  onAction?: ActionHandler,
  payload?: Record<string, unknown>
) {
  if (!onPress) {
    return {};
  }
  const handler = () => onAction?.(onPress, payload);
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
