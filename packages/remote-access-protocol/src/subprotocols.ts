/**
 * Helpers shared between every signaling-coordinator backend.
 *
 * The WebSocket signaling protocol carries metadata in the
 * `Sec-WebSocket-Protocol` header rather than in the URL or a custom header,
 * because browsers (deliberately) strip non-standard headers on the
 * WebSocket upgrade request. We accept three known tokens:
 *
 *   - `brika.v<n>`     — protocol version pin
 *   - `bearer.<token>` — hub-side bearer credential
 *   - `ticket.<token>` — client-side short-lived ticket
 *
 * Both `bearer.` and `ticket.` populate the same `bearer` field on the
 * parsed result, since the coordinator-side caller decides which form it
 * expected for the given route.
 */

export interface ParsedSubprotocols {
  /** The `brika.v<n>` token, e.g. `brika.v1`. */
  readonly proto?: string;
  /** Either the `bearer.<token>` or `ticket.<token>` payload. */
  readonly bearer?: string;
}

export function parseSubprotocols(header: string | null): ParsedSubprotocols {
  if (!header) {
    return {};
  }
  const out: { proto?: string; bearer?: string } = {};
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('brika.v')) {
      out.proto = trimmed;
    } else if (trimmed.startsWith('bearer.')) {
      out.bearer = trimmed.slice('bearer.'.length);
    } else if (trimmed.startsWith('ticket.')) {
      out.bearer = trimmed.slice('ticket.'.length);
    }
  }
  return out;
}

/**
 * Constant-time string equality. Use for credential comparisons so the
 * coordinator does not leak partial-match timing to an attacker probing
 * token prefixes.
 *
 * Inputs of unequal length return false immediately — distinguishing
 * "wrong length" from "right length, wrong contents" is fine; the secret
 * is the contents, not the length.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return diff === 0;
}
