/**
 * Clay's brand mark — a serif italic lowercase "c" inside a hairline
 * square stamp. The stamp metaphor matches the drafting-studio aesthetic
 * (maker's mark, printer's quoin) and the italic serif ties to the
 * Instrument Serif display face used in headlines.
 *
 * Renders as inline SVG so it inherits `currentColor` and scales with
 * the surrounding font-size when used at small sizes.
 */
export function ClayMenuIcon({ size = 24 }: { readonly size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <title>Clay</title>
      <rect x="2.5" y="2.5" width="19" height="19" rx="0.5" stroke="currentColor" strokeWidth="1" />
      <text
        x="12"
        y="17.25"
        textAnchor="middle"
        fontFamily='"Instrument Serif", "Iowan Old Style", Georgia, serif'
        fontSize="16"
        fontStyle="italic"
        fill="currentColor"
      >
        c
      </text>
    </svg>
  );
}
