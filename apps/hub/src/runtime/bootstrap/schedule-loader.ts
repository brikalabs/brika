import type { Json } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import type { BrikaConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { SchedulerService } from '@/runtime/scheduler/scheduler-service';
import type { Loader } from './loader';

@singleton()
export class ScheduleLoader implements Loader {
  readonly name = 'schedules';

  private readonly logs = inject(LogRouter);
  private readonly scheduler = inject(SchedulerService);

  async init(): Promise<void> {
    await this.scheduler.init();
  }

  async load(config: BrikaConfig): Promise<void> {
    for (const schedule of config.schedules.filter((s) => s.enabled)) {
      try {
        await this.scheduler.create({
          name: schedule.name,
          trigger: schedule.trigger,
          action: {
            tool: schedule.action.tool,
            args: schedule.action.args as Record<string, Json>,
          },
          enabled: true,
        });
        this.logs.info('schedule.loaded', { name: schedule.name });
      } catch (error) {
        this.logs.error('schedule.load.failed', { name: schedule.name, error: String(error) });
      }
    }
  }

  async stop(): Promise<void> {
    await this.scheduler.stop();
  }
}
