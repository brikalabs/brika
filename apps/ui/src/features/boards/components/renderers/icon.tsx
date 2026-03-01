import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';
import { clickableProps } from './shared';

const iconVariants = cva('shrink-0', {
  variants: {
    size: {
      sm: '@md:size-4 @xs:size-3.5 size-3',
      md: '@md:size-6 @xs:size-5 size-4',
      lg: '@md:size-8 @xs:size-7 size-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

defineRenderer('icon', ({ node, onAction }) => {
  const interactive = clickableProps(node.onPress, onAction);
  const icon = (
    <DynamicIcon
      name={node.name as IconName}
      className={iconVariants({
        size: node.size,
      })}
      style={
        node.color
          ? {
              color: resolveColor(node.color),
            }
          : undefined
      }
    />
  );

  if (!node.onPress) {
    return icon;
  }

  return (
    <span
      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-0.5 hover:bg-muted/50"
      {...interactive}
    >
      {icon}
    </span>
  );
});
