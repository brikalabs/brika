/**
 * Layer-2 component-token aggregator.
 *
 * Each component owns its tokens via a co-located `tokens.ts` that
 * calls `registerTokens(...)` on import. This file imports those
 * modules for their side effects, then exports the accumulated list
 * via `getRegisteredTokens()`.
 *
 * To onboard a new component: drop `tokens.ts` next to its `meta.ts`
 * and have it call `registerTokens([...])`. Add one bare import below.
 *
 * Tokens for components that don't yet have their own folder live in
 * `./orphan-components.ts`.
 */

import '../components/avatar/tokens';
import '../components/badge/tokens';
import '../components/button/tokens';
import '../components/card/tokens';
import '../components/code-block/tokens';
import '../components/dialog/tokens';
import '../components/dropdown-menu/tokens';
import '../components/input/tokens';
import '../components/password-input/tokens';
import '../components/popover/tokens';
import '../components/progress/tokens';
import '../components/select/tokens';
import '../components/separator/tokens';
import '../components/sheet/tokens';
import '../components/sidebar/tokens';
import '../components/slider/tokens';
import '../components/switch/tokens';
import '../components/table/tokens';
import '../components/tabs/tokens';
import '../components/textarea/tokens';
import '../components/tooltip/tokens';
import './orphan-components';

import { getRegisteredTokens } from './component-registry';
import type { TokenSpec } from './types';

export const COMPONENT_TOKENS: readonly TokenSpec[] = getRegisteredTokens();
