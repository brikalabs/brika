import type { BadgeVariant } from '@brika/tui';
import type { PluginHealth } from '../../shared/cli/api/plugins';

export const STATUS_VARIANT: Readonly<Record<PluginHealth, BadgeVariant>> = {
  running: 'success',
  crashed: 'destructive',
  'crash-loop': 'destructive',
  restarting: 'warning',
  installing: 'warning',
  updating: 'warning',
  degraded: 'warning',
  incompatible: 'warning',
  stopped: 'secondary',
};
