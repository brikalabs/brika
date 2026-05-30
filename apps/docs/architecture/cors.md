# CORS Allowlist

The hub's HTTP API uses **credentialed CORS** (`Access-Control-Allow-Credentials: true`). That means a browser will attach the operator's session cookies/`Authorization` header to cross-origin requests the hub explicitly approves. Getting the origin allowlist right is therefore a real security control, not a convenience: a too-permissive policy lets a malicious web page in the operator's browser drive the hub API with the operator's credentials (a classic cross-site credential-theft / CSRF-style attack).

The allowlist lives in `apps/hub/src/runtime/http/api-server.ts` as a typed predicate array (`CorsOriginMatcher`). Each entry is a pure `(origin: string) => boolean` predicate; an incoming `Origin` is allowed if **any** predicate returns `true`.

## What is allowed

The matcher is the ordered combination of three predicates:

1. **Configured production allowlist** — exact origins an operator pins via `hub.corsAllowlist` (or `BRIKA_CORS_ALLOWLIST`). Empty by default.
2. **`hub.brika.dev` over HTTPS** — the canonical remote UI shell that proxies back over the WebRTC data channel.
3. **Loopback + private-network origins** — `localhost`, `127.0.0.1`, `[::1]`, `*.local` (mDNS), RFC1918 ranges (`10/8`, `172.16/12`, `192.168/16`), IPv4 link-local (`169.254/16`), and IPv6 unique-local/link-local (`fc00::/7`, `fe80::/10`). This covers Vite dev, LAN devices, and self-hosted access.

Everything else is rejected.

> **Why the private-network defaults are anchored.** The IPv4 checks are anchored regexes, not `startsWith('10.')`. Free wildcard-DNS services (`nip.io`, `sslip.io`) resolve names like `10.0.0.1.evil.com` to attacker-controlled hosts, so an unanchored prefix check would let those names defeat the LAN allowlist. See the comments in `isPrivateNetworkOrigin` and the regression tests in `cors-allowlist.test.ts`.

## Pinning production origins

When you serve the UI from a fixed public origin (a reverse proxy, a custom domain), pin that exact origin so the API accepts credentialed requests from it. Set it in `brika.yml`:

```yaml
hub:
  corsAllowlist:
    - https://app.example.com
    - https://admin.example.com
```

…or via the environment (comma-separated, wins over the config value):

```sh
BRIKA_CORS_ALLOWLIST="https://app.example.com,https://admin.example.com"
```

### Matching is exact

Configured origins are compared against the **canonical `URL().origin`** form — scheme + host + port. Matching is:

- **Exact**, never prefix or substring. `https://app.example.com` does **not** match `https://app.example.com.evil.com` or `https://evil-app.example.com`.
- **Scheme- and port-sensitive**. `http://app.example.com` is a different origin than `https://app.example.com`.
- **Trailing-slash tolerant** on the incoming `Origin` only (browsers may send `https://app.example.com/`); the value canonicalises before comparison.

Each entry is validated with a zod schema at config-load time. A malformed entry (wrong scheme, a path/query/fragment, a non-string) is rejected and logged, and the allowlist falls back to empty rather than silently widening the policy.

## Defaults are preserved

The configured allowlist is **additive**. When it is empty (the default), it matches nothing and the built-in LAN/dev predicates remain fully in charge — so local development, mDNS, and `hub.brika.dev` keep working with no configuration. Pinning a production origin only **adds** to what is already allowed; it never removes the LAN defaults.

## Precedence

`BRIKA_CORS_ALLOWLIST` (comma-separated) overrides `hub.corsAllowlist` from `brika.yml`, consistent with the rest of the hub's [env-over-config precedence](../cli/environment.md#precedence). A malformed env value falls back to the config-sourced list.

## Related hardening

- **Host header allowlist** — a separate middleware (`hostAllowlist`) rejects unexpected `Host` headers; loopback/private ranges are always allowed there too.
- **Trusted client IP** — the hub overwrites `x-forwarded-for` with the real socket IP on direct connections, trusting proxy headers only from a real reverse proxy.

> **Follow-up (out of scope here):** a double-submit CSRF token middleware would further harden state-changing requests for browser clients. It is tracked separately to keep the CORS change reviewable.

## See also

- **[Configuration File](../cli/configuration.md)** — `hub.corsAllowlist` field.
- **[Environment Variables](../cli/environment.md)** — `BRIKA_CORS_ALLOWLIST`.
- **[Remote Access](remote-access.md)** — how the `hub.brika.dev` shell reaches the hub.
