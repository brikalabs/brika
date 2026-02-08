import type { ButtonNode } from '@brika/ui-kit';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';
import { Button } from '@/components/ui';
import type { ActionHandler } from './registry';

function getClickHandler(node: ButtonNode, onAction?: ActionHandler) {
  if (node.url) return () => window.open(node.url, '_blank', 'noopener');
  return () => node.onPress && onAction?.(node.onPress);
}

function getColorStyle(color: string | undefined, variant: string): React.CSSProperties | undefined {
  if (!color) return undefined;
  if (variant === 'ghost' || variant === 'link') return { color };
  return { backgroundColor: color, borderColor: 'transparent', color: '#fff' };
}

export const ButtonRenderer = memo(function ButtonRenderer({
  node,
  onAction,
}: {
  node: ButtonNode;
  onAction?: ActionHandler;
}) {
  const variant = node.variant ?? 'default';
  const iconOnly = node.icon && !node.label;

  return (
    <Button
      variant={variant}
      size={iconOnly ? 'icon-sm' : 'sm'}
      className={iconOnly ? 'shrink-0 rounded-full' : 'shrink-0'}
      onClick={getClickHandler(node, onAction)}
      style={getColorStyle(node.color, variant)}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className={iconOnly ? 'size-4' : 'mr-1 size-3.5'} />}
      {node.label}
    </Button>
  );
});
