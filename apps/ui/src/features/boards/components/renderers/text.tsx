import { resolveIntlRef } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';
import { clickableProps } from './shared';

const textVariants = cva('min-w-0 truncate tabular-nums', {
  variants: {
    variant: {
      heading: 'font-semibold text-xs @xs:text-sm',
      caption: 'text-[10px] @xs:text-[11px] text-muted-foreground',
      body: 'text-[11px] @xs:text-xs',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    size: {
      xs: '!text-[10px] @xs:!text-[11px]',
      sm: '!text-[11px] @xs:!text-xs',
      md: '!text-xs @xs:!text-sm',
      lg: '!text-sm @xs:!text-base',
      xl: '!text-base @xs:!text-lg',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

defineRenderer('text', ({ node, onAction }) => {
  const { t, i18n } = useTranslation();

  let content: string;
  if (node.i18n) {
    content = t(node.i18n.key, { ns: node.i18n.ns, nsSeparator: false, defaultValue: node.content, ...node.i18n.params });
  } else if (node.intl) {
    const locale = i18n.language === 'cimode' ? 'en' : i18n.language;
    content = resolveIntlRef(node.intl, locale);
  } else {
    content = node.content;
  }
  const resolved = resolveColor(node.color);
  const lineClampStyle: Record<string, unknown> = node.maxLines
    ? { display: '-webkit-box', WebkitLineClamp: node.maxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : {};
  const style: React.CSSProperties = {
    ...(resolved ? { color: resolved } : undefined),
    ...lineClampStyle,
  };

  return (
    <p
      className={cn(
        textVariants({
          variant: node.variant,
          align: node.align,
          weight: node.weight,
          size: node.size,
        }),
        node.maxLines && 'whitespace-normal',
        node.onPress && 'cursor-pointer'
      )}
      style={Object.keys(style).length > 0 ? style : undefined}
      {...clickableProps(node.onPress, onAction)}
    >
      {content}
    </p>
  );
});
