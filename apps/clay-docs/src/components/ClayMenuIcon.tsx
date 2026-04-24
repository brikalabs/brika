/**
 * Clay wordmark + mark — a stacked set of three "bricks" above the word.
 * Kept inline as SVG so it inherits `currentColor` and scales with the font.
 */
export function ClayMenuIcon({ size = 24 }: { readonly size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <title>Clay</title>
      <rect x="3" y="4" width="18" height="4" />
      <rect x="3" y="10" width="18" height="4" />
      <rect x="3" y="16" width="18" height="4" />
    </svg>
  );
}
