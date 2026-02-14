import { inject, singleton } from '@brika/di';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { DashboardLoader, DashboardService } from '@/runtime/dashboards';
import { BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import type { Loader } from './loader';

@singleton()
export class DashboardsLoader implements Loader {
  readonly name = 'dashboards';

  private readonly dashboardLoader = inject(DashboardLoader);
  private readonly dashboardService = inject(DashboardService);
  private readonly configLoader = inject(ConfigLoader);
  private readonly events = inject(EventSystem);
  private unsubTypeRegistered: (() => void) | null = null;

  async load(_config: BrikaConfig): Promise<void> {
    // Mount instances when dashboards are hot-reloaded (only if actively viewed)
    this.dashboardLoader.onChange((id, action) => {
      if (action === 'load' && this.dashboardService.hasActiveViewers(id)) {
        const dashboard = this.dashboardLoader.get(id);
        if (dashboard) this.dashboardService.mountDashboard(dashboard);
      }
    });

    // When a brick type is registered (plugin ready), mount any pending placements.
    // This solves the race where dashboards load before plugins finish starting.
    this.unsubTypeRegistered = this.events.subscribe(BrickActions.typeRegistered, (action) => {
      this.dashboardService.mountPendingForType(action.payload.brickTypeId);
    });

    // Load YAML dashboards with hot-reload
    await this.dashboardLoader.loadDir(`${this.configLoader.getBrikaDir()}/dashboards`);
    this.dashboardLoader.watch();
  }

  async stop(): Promise<void> {
    this.unsubTypeRegistered?.();
    this.dashboardLoader.stopWatching();

    // Unmount all dashboard instances
    for (const dashboard of this.dashboardLoader.list()) {
      this.dashboardService.unmountDashboard(dashboard);
    }
  }
}
