import type { ButtonNode } from '@brika/ui-kit';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';
import { Button } from '@/components/ui';
import type { ActionHandler } from './registry';

export const ButtonRenderer = memo(function ButtonRenderer({
  node,
  onAction,
}: {
  node: ButtonNode;
  onAction?: ActionHandler;
}) {
  const variant = node.variant ?? 'default';
  const iconOnly = node.icon && !node.label;

  const handleClick = node.url
    ? () => window.open(node.url, '_blank', 'noopener')
    : () => node.onPress && onAction?.(node.onPress);

  // Custom color: use as background for filled variants, text-only for ghost/link
  const colorStyle: React.CSSProperties | undefined = node.color
    ? variant === 'ghost' || variant === 'link'
      ? { color: node.color }
      : { backgroundColor: node.color, borderColor: 'transparent', color: '#fff' }
    : undefined;

  return (
    <Button
      variant={variant}
      size={iconOnly ? 'icon-sm' : 'sm'}
      className={iconOnly ? 'shrink-0 rounded-full' : 'shrink-0'}
      onClick={handleClick}
      style={colorStyle}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className={iconOnly ? 'size-4' : 'mr-1 size-3.5'} />}
      {node.label}
    </Button>
  );
});
