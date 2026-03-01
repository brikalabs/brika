import { type SVGProps } from 'react';
import { cn } from '@/lib/utils';

type BrikaLogoVariant = 'mark' | 'full';

interface BrikaLogoProps extends SVGProps<SVGSVGElement> {
  variant?: BrikaLogoVariant;
}

/**
 * Brika brand logo.
 *
 * - `mark` (default) — icon shapes only, colored via `currentColor`
 * - `full` — black rounded-rect background with white shapes
 */
export function BrikaLogo({ variant = 'mark', className, ...props }: Readonly<BrikaLogoProps>) {
  const isFull = variant === 'full';
  const fill = isFull ? 'white' : 'currentColor';

  return (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      {...props}
    >
      {isFull && <rect width="240" height="240" rx="65" fill="black" />}
      <path
        d="M119 60.8929C119 58.2059 119 56.8625 119.143 55.734C120.177 47.5898 126.59 41.1767 134.734 40.1432C135.862 40 137.206 40 139.893 40H146C166.987 40 184 57.0132 184 78C184 98.9868 166.987 116 146 116H139.893C137.206 116 135.862 116 134.734 115.857C126.59 114.823 120.177 108.41 119.143 100.266C119 99.1375 119 97.7941 119 95.1071V60.8929Z"
        fill={fill}
      />
      <path
        d="M119 148.107C119 142.427 119 139.587 119.635 137.26C121.313 131.114 126.114 126.313 132.26 124.635C134.587 124 137.427 124 143.107 124H156C176.987 124 194 141.013 194 162C194 182.987 176.987 200 156 200H143.107C137.427 200 134.587 200 132.26 199.365C126.114 197.687 121.313 192.886 119.635 186.74C119 184.413 119 181.573 119 175.893V148.107Z"
        fill={fill}
      />
      <rect x="63" y="152" width="48" height="48" rx="18" fill={fill} />
      <rect x="63" y="96" width="48" height="48" rx="18" fill={fill} />
      <rect x="63" y="40" width="48" height="48" rx="18" fill={fill} />
    </svg>
  );
}
