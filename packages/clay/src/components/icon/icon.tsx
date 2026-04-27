import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../primitives/cn';

const iconVariants = cva('shrink-0', {
  variants: {
    tone: {
      default: 'text-icon',
      muted: 'text-icon-muted',
      primary: 'text-icon-primary',
    },
    size: {
      xs: 'size-3',
      sm: 'size-3.5',
      default: 'size-4',
      lg: 'size-5',
    },
  },
  defaultVariants: {
    tone: 'default',
    size: 'default',
  },
});

/** Concrete tone values accepted by {@link Icon}. */
export type IconTone = NonNullable<VariantProps<typeof iconVariants>['tone']>;

/** Concrete size values accepted by {@link Icon}. */
export type IconSize = NonNullable<VariantProps<typeof iconVariants>['size']>;

/**
 * Component identity of any SVG icon (e.g. a `lucide-react` icon).
 *
 * Anything that renders an SVG and accepts standard `SVGProps` will
 * satisfy this contract — the wrapper does not depend on lucide-react
 * at the type level so consumers can pass any compatible SVG component.
 */
export type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  /**
   * The icon component to render. Typically a `lucide-react` icon
   * (e.g. `Bell`, `AlertCircle`) but any `React.ComponentType` that
   * accepts `SVGProps<SVGSVGElement>` is supported.
   */
  as: IconComponent;
  /**
   * Semantic color of the icon, mapped to one of Clay's icon-color
   * tokens (`--icon`, `--icon-muted`, `--icon-primary`). Defaults to
   * `'default'`.
   */
  tone?: IconTone;
  /**
   * Visual size of the icon. Maps to Tailwind `size-*` utilities
   * (`xs` → 0.75rem, `sm` → 0.875rem, `default` → 1rem, `lg` →
   * 1.25rem). Defaults to `'default'`.
   */
  size?: IconSize;
  /**
   * Extra class names merged onto the rendered SVG. Use this to
   * override defaults or compose layout utilities — Clay merges with
   * `tailwind-merge` so the caller's classes win on conflict.
   */
  className?: string;
}

/**
 * Thin wrapper around any SVG icon component that maps a `tone` prop
 * to one of Clay's semantic icon-color tokens. The wrapper exists to
 * make the token contract visible at call sites: consumers write
 * `<Icon as={Bell} tone="primary" />` instead of remembering
 * `text-icon-primary`.
 *
 * Decorative by default — if no `aria-label` is supplied the icon is
 * marked `aria-hidden="true"` so screen readers skip it. Pass an
 * `aria-label` (or `role="img"`) to surface meaning.
 */
function Icon({
  as: Component,
  tone = 'default',
  size = 'default',
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  ...props
}: IconProps) {
  const isDecorative = ariaLabel === undefined && ariaHidden === undefined;

  return (
    <Component
      data-slot="icon"
      data-tone={tone}
      className={cn(iconVariants({ tone, size }), className)}
      aria-label={ariaLabel}
      aria-hidden={isDecorative ? true : ariaHidden}
      {...props}
    />
  );
}

export { Icon, iconVariants };
