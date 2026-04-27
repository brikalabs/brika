import { ClayLogo } from '@brika/clay/components/clay-logo';

/**
 * Sidebar rail mark — Clay's badged tile logo, sized to fit the 48px rail.
 * Tile colour follows `text-clay-brand` so it stays in lockstep with the
 * other terracotta accents on the page.
 */
export function ClayMenuIcon({ size = 24 }: { readonly size?: number }) {
  return <ClayLogo variant="badge" className="text-clay-brand" width={size} height={size} />;
}
