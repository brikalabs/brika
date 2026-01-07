import { inject, singleton } from '@brika/shared';
import { AutomationEngine, WorkflowLoader } from '@/runtime/automations';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import type { Loader } from './loader';

@singleton()
export class AutomationLoader implements Loader {
  readonly name = 'automations';

  private readonly engine = inject(AutomationEngine);
  private readonly workflowLoader = inject(WorkflowLoader);
  private readonly configLoader = inject(ConfigLoader);

  async init(): Promise<void> {
    await this.engine.init();
  }

  async load(_config: BrikaConfig): Promise<void> {
    // Load TOML workflows with hot-reload
    await this.workflowLoader.loadDir(`${this.configLoader.getBrikaDir()}/automations`);
    this.workflowLoader.watch();
  }

  async stop(): Promise<void> {
    this.workflowLoader.stopWatching();
    await this.engine.stop();
  }
}
