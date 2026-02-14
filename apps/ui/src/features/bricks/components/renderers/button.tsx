import type { ButtonNode } from '@brika/ui-kit';
import { Loader2 } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { type ActionHandler, defineRenderer } from './registry';
import { isToken, resolveBackground, resolveColor, tokenForeground } from './resolve-color';

function getClickHandler(node: ButtonNode, onAction?: ActionHandler) {
  if (node.disabled || node.loading) return undefined;
  if (node.url) return () => window.open(node.url, '_blank', 'noopener');
  return () => node.onPress && onAction?.(node.onPress);
}

function getColorStyle(
  color: string | undefined,
  variant: string
): React.CSSProperties | undefined {
  if (!color) return undefined;
  if (variant === 'ghost' || variant === 'link') return { color: resolveColor(color) };
  // For filled variants, pair token with its foreground companion
  const bg = resolveBackground(color) ?? resolveColor(color);
  const fg = isToken(color) ? (tokenForeground(color) ?? '#fff') : '#fff';
  return { backgroundColor: bg, borderColor: 'transparent', color: fg };
}

const sizeMap = { sm: 'sm', md: 'default', lg: 'lg' } as const;

defineRenderer('button', ({ node, onAction }) => {
  const variant = node.variant ?? 'default';
  const iconOnly = !node.loading && node.icon && !node.label;
  const isDisabled = node.disabled || node.loading;
  const size = node.size ? sizeMap[node.size] : iconOnly ? 'icon-sm' : 'sm';

  return (
    <Button
      variant={variant}
      size={size as 'sm' | 'default' | 'lg' | 'icon-sm'}
      className={cn('shrink-0', iconOnly && 'rounded-full', node.fullWidth && 'w-full')}
      onClick={getClickHandler(node, onAction)}
      style={getColorStyle(node.color, variant)}
      disabled={isDisabled}
    >
      {node.loading ? (
        <Loader2 className={cn('animate-spin', node.label ? 'mr-1 size-3.5' : 'size-4')} />
      ) : (
        node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className={iconOnly ? 'size-4' : 'mr-1 size-3.5'}
          />
        )
      )}
      {node.label}
    </Button>
  );
});
