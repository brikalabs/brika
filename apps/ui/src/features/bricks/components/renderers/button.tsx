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
  const variant =
    node.variant === 'default' || !node.variant
      ? 'default'
      : node.variant === 'destructive'
        ? 'destructive'
        : (node.variant as 'outline' | 'ghost');

  return (
    <Button
      variant={variant}
      size="sm"
      className="shrink-0 rounded-md"
      onClick={() => onAction?.(node.onPress)}
      style={node.color ? { borderColor: node.color, color: node.color } : undefined}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className="mr-1.5 size-3.5" />}
      {node.label}
    </Button>
  );
});
