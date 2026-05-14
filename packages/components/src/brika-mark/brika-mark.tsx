import { cn } from '@brika/clay/primitives/cn';
import type { CSSProperties, ReactElement } from 'react';

export type BrikaMarkState = 'loading' | 'idle' | 'error';

export interface BrikaMarkProps {
  /**
   * Visual + animation state.
   * - `loading`: build-in + per-shape shimmer + halo pulse.
   * - `idle`:    static, shapes at rest, no halo animation.
   * - `error`:   top brick falls onto the pile + destructive-tinted halo + ring pulse.
   */
  readonly state: BrikaMarkState;
  /** Wrapper edge length in pixels. Defaults to 96 (matches `size-24`). */
  readonly size?: number;
  /** Extra classes for the wrapper. */
  readonly className?: string;
}

export function BrikaMark({ state, size = 96, className }: Readonly<BrikaMarkProps>): ReactElement {
  const isStatic = state !== 'loading';
  const isError = state === 'error';
  const wrapperStyle: CSSProperties = { width: size, height: size };
  return (
    <div
      className={cn(
        'relative grid place-items-center rounded-[26px] bg-foreground shadow-foreground/15 shadow-lg transition-shadow duration-300',
        className
      )}
      style={wrapperStyle}
      data-brika-static={isStatic ? '' : undefined}
      data-brika-error={isError ? '' : undefined}
      aria-hidden="true"
    >
      <span className="brika-mark-halo" />
      <svg
        className="size-5/6 overflow-visible text-background"
        viewBox="0 0 240 240"
        fill="currentColor"
      >
        <path
          className="brika-mark-shape"
          data-pos="r-top"
          d="M119 60.893C119 58.206 119 56.862 119.143 55.734C120.177 47.59 126.59 41.177 134.734 40.143C135.862 40 137.206 40 139.893 40H146C166.987 40 184 57.013 184 78S166.987 116 146 116H139.893C137.206 116 135.862 116 134.734 115.857C126.59 114.823 120.177 108.41 119.143 100.266C119 99.137 119 97.794 119 95.107V60.893Z"
        />
        <path
          className="brika-mark-shape"
          data-pos="r-bot"
          d="M119 148.107C119 142.427 119 139.587 119.635 137.26C121.313 131.114 126.114 126.313 132.26 124.635C134.587 124 137.427 124 143.107 124H156C176.987 124 194 141.013 194 162S176.987 200 156 200H143.107C137.427 200 134.587 200 132.26 199.365C126.114 197.687 121.313 192.886 119.635 186.74C119 184.413 119 181.573 119 175.893V148.107Z"
        />
        <rect
          className="brika-mark-shape"
          data-pos="l-3"
          x="63"
          y="152"
          width="48"
          height="48"
          rx="18"
        />
        <rect
          className="brika-mark-shape"
          data-pos="l-2"
          x="63"
          y="96"
          width="48"
          height="48"
          rx="18"
        />
        <rect
          className="brika-mark-shape"
          data-pos="l-1"
          x="63"
          y="40"
          width="48"
          height="48"
          rx="18"
        />
      </svg>
    </div>
  );
}
