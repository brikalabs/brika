import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '../../primitives/cn';
import { Separator } from '../separator';

/**
 * ButtonGroup — visually-joined cluster of buttons that share one frame.
 *
 * The frame (border, resting shadow, outer rounded corners, dividers) is
 * owned by the wrapper. Direct children are stripped of their own
 * `border` / `shadow` / `rounded-*` so two adjacent buttons can never
 * paint a doubled edge between them — the divider is a single `1px`
 * left/top stroke painted by the wrapper rule, never a stack of two
 * borders. First / last children round their outer corners to match
 * the wrapper without `overflow-hidden`, so focus rings stay visible.
 *
 * Children keep their own background, text colour, and hover/active
 * states — variants like `default` (filled) and `outline` both look
 * right inside the group, just without their decorative edges.
 */
// Strip every direct child's own visual frame. `!` is needed because
// Button's CVA emits `border`, `rounded-button`, and `shadow-*` at the
// same specificity as our `[&>*]:` arbitrary variant; `!` keeps the
// strip declarations winning regardless of source order.
const wrapperClasses = [
  'isolate inline-flex w-fit rounded-button border border-input-border bg-input-container shadow-surface',
  '[&>*]:!rounded-none [&>*]:!border-0 [&>*]:!shadow-none [&>*]:relative',
  '[&>*]:focus-visible:z-10',
  // SelectTrigger inside a group: never let the implicit hidden select
  // option steal the right rounding from the trigger.
  'has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:!rounded-r-button',
  "[&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
].join(' ');

const horizontalClasses = [
  // Outer corners round to match the wrapper. Inner dividers are a
  // 1px left border on every non-first child.
  '[&>*:first-child]:!rounded-l-button [&>*:last-child]:!rounded-r-button',
  '[&>*:not(:first-child)]:!border-l [&>*:not(:first-child)]:!border-l-input-border',
].join(' ');

const verticalClasses = [
  'flex-col',
  '[&>*:first-child]:!rounded-t-button [&>*:last-child]:!rounded-b-button',
  '[&>*:not(:first-child)]:!border-t [&>*:not(:first-child)]:!border-t-input-border',
].join(' ');

const buttonGroupVariants = cva(wrapperClasses, {
  variants: {
    orientation: {
      horizontal: horizontalClasses,
      vertical: verticalClasses,
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof buttonGroupVariants> & {
    /** Lay buttons out horizontally or vertically. */
    orientation?: VariantProps<typeof buttonGroupVariants>['orientation'];
  }) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(
        buttonGroupVariants({
          orientation,
        }),
        className
      )}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : 'div';

  return (
    <Comp
      className={cn(
        "flex items-center gap-2 px-4 font-medium text-muted-foreground text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

function ButtonGroupSeparator({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        '!m-0 relative self-stretch bg-input-border data-[orientation=vertical]:h-auto',
        className
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
