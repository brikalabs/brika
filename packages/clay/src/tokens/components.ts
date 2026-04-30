/**
 * Layer-2 component-token aggregator.
 *
 * Each component owns its tokens via a co-located `tokens.ts` that
 * exports a `tokens` array (built via `defineComponent` from
 * [`./define.ts`](./define.ts)). This file imports each one by name and
 * concatenates them into `COMPONENT_TOKENS`.
 *
 * To onboard a new component: drop `tokens.ts` next to its `meta.ts`,
 * have it `export const tokens = defineComponent('<name>', { ... })`,
 * and add one named import + spread below.
 */

import { tokens as alert } from '../components/alert/tokens';
import { tokens as alertDialog } from '../components/alert-dialog/tokens';
import { tokens as avatar } from '../components/avatar/tokens';
import { tokens as badge } from '../components/badge/tokens';
import { tokens as breadcrumb } from '../components/breadcrumb/tokens';
import { tokens as button } from '../components/button/tokens';
import { tokens as buttonGroup } from '../components/button-group/tokens';
import { tokens as card } from '../components/card/tokens';
import { tokens as chart } from '../components/chart/tokens';
import { tokens as checkbox } from '../components/checkbox/tokens';
import { tokens as codeBlock } from '../components/code-block/tokens';
import { tokens as collapsible } from '../components/collapsible/tokens';
import { tokens as dialog } from '../components/dialog/tokens';
import { tokens as dropdownMenu } from '../components/dropdown-menu/tokens';
import { tokens as emptyState } from '../components/empty-state/tokens';
import { tokens as icon } from '../components/icon/tokens';
import { tokens as input } from '../components/input/tokens';
import { tokens as inputGroup } from '../components/input-group/tokens';
import { tokens as label } from '../components/label/tokens';
import { tokens as overflowList } from '../components/overflow-list/tokens';
import { tokens as pageHeader } from '../components/page-header/tokens';
import { tokens as passwordInput } from '../components/password-input/tokens';
import { tokens as popover } from '../components/popover/tokens';
import { tokens as progress } from '../components/progress/tokens';
import { tokens as progressDisplay } from '../components/progress-display/tokens';
import { tokens as scrollArea } from '../components/scroll-area/tokens';
import { tokens as section } from '../components/section/tokens';
import { tokens as sectionLabel } from '../components/section-label/tokens';
import { tokens as select } from '../components/select/tokens';
import { tokens as separator } from '../components/separator/tokens';
import { tokens as sheet } from '../components/sheet/tokens';
import { tokens as sidebar } from '../components/sidebar/tokens';
import { tokens as skeleton } from '../components/skeleton/tokens';
import { tokens as slider } from '../components/slider/tokens';
import { tokens as switchTokens } from '../components/switch/tokens';
import { tokens as table } from '../components/table/tokens';
import { tokens as tabs } from '../components/tabs/tokens';
import { tokens as textarea } from '../components/textarea/tokens';
import { tokens as toast } from '../components/toast/tokens';
import { tokens as tooltip } from '../components/tooltip/tokens';

import type { TokenSpec } from './types';

export const COMPONENT_TOKENS: readonly TokenSpec[] = [
  ...alert,
  ...alertDialog,
  ...avatar,
  ...badge,
  ...breadcrumb,
  ...button,
  ...buttonGroup,
  ...card,
  ...chart,
  ...checkbox,
  ...codeBlock,
  ...collapsible,
  ...dialog,
  ...dropdownMenu,
  ...emptyState,
  ...icon,
  ...input,
  ...inputGroup,
  ...label,
  ...overflowList,
  ...pageHeader,
  ...passwordInput,
  ...popover,
  ...progress,
  ...progressDisplay,
  ...scrollArea,
  ...section,
  ...sectionLabel,
  ...select,
  ...separator,
  ...sheet,
  ...sidebar,
  ...skeleton,
  ...slider,
  ...switchTokens,
  ...table,
  ...tabs,
  ...textarea,
  ...toast,
  ...tooltip,
];
