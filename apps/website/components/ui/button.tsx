import { type VariantProps, cva } from 'class-variance-authority';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium hover:scale-[1.02] active:scale-[0.98] transition-[transform,box-shadow] duration-200',
  {
    variants: {
      variant: {
        filled:
          'btn-rotate btn-rotate-filled shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
        outline: 'btn-rotate',
        glow: 'btn-glow border border-border bg-surface hover:bg-muted',
      },
      size: {
        sm: 'px-4 py-1.5 text-xs',
        md: 'px-5 py-2 text-sm',
        lg: 'px-6 py-3 text-sm font-semibold',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'lg',
    },
  },
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  className?: string;
};

type ButtonAsAnchor = ButtonBaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonAsButton = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

type ButtonProps = ButtonAsAnchor | ButtonAsButton;

function Button({ variant, size, className, ...props }: Readonly<ButtonProps>) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if ('href' in props && props.href != null) {
    return <a className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} />;
  }

  return <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
}

export { Button, buttonVariants };
export type { ButtonProps };
