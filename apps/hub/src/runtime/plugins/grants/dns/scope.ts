/**
 * Shared scope-check for every `ctx.dns.*` grant.
 *
 * Reuses the host pattern matcher from the net grant — the syntax is
 * identical (`*.example.com`) and DNS is conceptually a network call.
 * Keeping the match logic in one place means an operator who allow-lists
 * `api.example.com` for net automatically gets the same matching rules
 * if they later add it to the dns scope.
 */

import { errors } from '@brika/errors';
import { isHostAllowed } from '../net/host-allow';

export function assertHostInDnsScope(host: string, allow: ReadonlyArray<string>): void {
  if (isHostAllowed(host, allow)) {
    return;
  }
  throw errors.netHostNotAllowed({ host, allow: [...allow] });
}
