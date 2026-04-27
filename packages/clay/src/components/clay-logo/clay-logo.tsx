import { type SVGProps } from 'react';
import { cn } from '../../primitives/cn';

type ClayLogoVariant = 'badge' | 'glyph';

interface ClayLogoProps extends SVGProps<SVGSVGElement> {
  /** Which lockup to render: "badge" wraps the tiles in a rounded-rect; "glyph" renders the tiles only. */
  variant?: ClayLogoVariant;
}

/**
 * Clay brand logo — three rounded tiles (one tall left, two stacked right).
 *
 * Tiles render with `currentColor` so the mark themes via Tailwind `text-*`
 * utilities (e.g. `text-clay-brand` → primary). The badge background defaults
 * to the active theme's `--secondary` so the chip always reads as distinct
 * from the page surface; override with the `--clay-logo-bg` CSS variable
 * when a fixed bg is needed (marketing surfaces, OG cards, etc.).
 */
export function ClayLogo({ variant = 'badge', className, ...props }: Readonly<ClayLogoProps>) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      {...props}
    >
      {variant === 'badge' && (
        <rect
          x="3"
          y="3"
          width="94"
          height="94"
          rx="22"
          fill="var(--clay-logo-bg, var(--secondary))"
        />
      )}
      <rect x="24" y="22" width="18.7" height="56" rx="4" fill="currentColor" />
      <rect x="48.7" y="22" width="27.3" height="25" rx="4" fill="currentColor" />
      <rect x="48.7" y="53" width="27.3" height="25" rx="4" fill="currentColor" />
    </svg>
  );
}
