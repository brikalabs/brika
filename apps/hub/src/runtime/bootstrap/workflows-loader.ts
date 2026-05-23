import { inject, singleton } from '@brika/di';
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

  // biome-ignore lint/suspicious/useAwait: interface Loader requires Promise<void> return; engine.init() is currently sync but may become async later.
  async init(): Promise<void> {
    this.engine.init();
  }

  async load(_config: BrikaConfig): Promise<void> {
    // Load YAML workflows with hot-reload
    await this.workflowLoader.loadDir(`${this.configLoader.getBrikaDir()}/workflows`);
    this.workflowLoader.watch();
  }

  // biome-ignore lint/suspicious/useAwait: interface Loader requires Promise<void> return; engine.stop() is currently sync but may become async later.
  async stop(): Promise<void> {
    this.workflowLoader.stopWatching();
    this.engine.stop();
  }
}
