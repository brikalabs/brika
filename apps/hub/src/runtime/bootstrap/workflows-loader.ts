import { inject, singleton } from '@brika/shared';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';
import type { Loader } from './loader';

@singleton()
export class WorkflowsLoader implements Loader {
  readonly name = 'workflows';

  private readonly engine = inject(WorkflowEngine);
  private readonly workflowLoader = inject(WorkflowLoader);
  private readonly configLoader = inject(ConfigLoader);

  async init(): Promise<void> {
    await this.engine.init();
  }

  async load(_config: BrikaConfig): Promise<void> {
    // Load YAML workflows with hot-reload
    await this.workflowLoader.loadDir(`${this.configLoader.getBrikaDir()}/workflows`);
    this.workflowLoader.watch();
  }

  async stop(): Promise<void> {
    this.workflowLoader.stopWatching();
    await this.engine.stop();
  }
}
