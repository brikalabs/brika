import { inject, singleton } from '@elia/shared';
import { AutomationEngine, YamlWorkflowLoader } from '@/runtime/automations';
import type { EliaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import type { Loader } from './loader';

@singleton()
export class AutomationLoader implements Loader {
  readonly name = 'automations';

  private readonly engine = inject(AutomationEngine);
  private readonly yamlLoader = inject(YamlWorkflowLoader);
  private readonly configLoader = inject(ConfigLoader);

  async init(): Promise<void> {
    await this.engine.init();
  }

  async load(_config: EliaConfig): Promise<void> {
    // Load YAML workflows with hot-reload
    await this.yamlLoader.loadDir(`${this.configLoader.getEliaDir()}/automations`);
    this.yamlLoader.watch();
  }

  async stop(): Promise<void> {
    this.yamlLoader.stopWatching();
    await this.engine.stop();
  }
}
