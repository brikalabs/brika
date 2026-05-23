/**
 * Host allow-list matching.
 *
 * Patterns are bare hostnames (`api.example.com`) or one-level subdomain
 * wildcards (`*.example.com`). DNS is case-insensitive (RFC 4343), so we
 * lower-case both sides before comparing.
 *
 * The wildcard `*.foo.com` deliberately does NOT match the bare `foo.com`
 * — an operator who wants both must list both. This is the OWASP-recommended
 * behaviour for allow-lists; the common mistake (`*.foo.com` also matching
 * `foo.com`) lets an attacker who controls `foo.com` reach the same endpoint
 * an operator only meant to whitelist for subdomains.
 */

export function matchesHostPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p === h) {
    return true;
  }
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return h.endsWith(`.${suffix}`);
  }
  return false;
}

export function isHostAllowed(host: string, allow: ReadonlyArray<string>): boolean {
  for (const pattern of allow) {
    if (matchesHostPattern(host, pattern)) {
      return true;
    }
  }
  return false;
}
