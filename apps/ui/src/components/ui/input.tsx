import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.ComponentProps<'input'> {
  /**
   * Icon to display on the left side of the input
   */
  leftIcon?: React.ReactNode;
  /**
   * Icon to display on the right side of the input
   */
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className="relative w-full">
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            data-slot="input"
            className={cn(
              // Base styles
              'selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground',
              'h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all',
              'outline-none',
              // File input styles
              'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-sm',
              // Hover state
              'hover:border-input/80 hover:bg-accent/5',
              // Focus state
              'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
              // Disabled state
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              // Invalid state
              'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
              // Icon padding
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          // Base styles
          'selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground',
          'h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all',
          'outline-none',
          // File input styles
          'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-sm',
          // Hover state
          'hover:border-input/80 hover:bg-accent/5',
          // Focus state
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
          // Disabled state
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          // Invalid state
          'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
