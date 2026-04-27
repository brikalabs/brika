/**
 * Layer-2 component-token aggregator.
 *
 * Each component owns its tokens via a co-located `tokens.ts` that
 * calls `defineComponent(...)` (see [`./define.ts`](./define.ts)) on
 * import. This file imports those modules for their side effects, then
 * exports the accumulated list via `getRegisteredTokens()`.
 *
 * To onboard a new component: drop `tokens.ts` next to its `meta.ts`,
 * have it call `defineComponent('<name>', { ... })`, and add one bare
 * import below.
 */

import '../components/alert/tokens';
import '../components/avatar/tokens';
import '../components/badge/tokens';
import '../components/button/tokens';
import '../components/card/tokens';
import '../components/checkbox/tokens';
import '../components/code-block/tokens';
import '../components/dialog/tokens';
import '../components/dropdown-menu/tokens';
import '../components/icon/tokens';
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
import '../components/toast/tokens';
import '../components/tooltip/tokens';

import { getRegisteredTokens } from './component-registry';
import type { TokenSpec } from './types';

export const COMPONENT_TOKENS: readonly TokenSpec[] = getRegisteredTokens();
