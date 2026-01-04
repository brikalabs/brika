import type { Json } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import type { EliaConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { RulesEngine } from '@/runtime/rules/rules-engine';
import type { Loader } from './loader';

@singleton()
export class RuleLoader implements Loader {
  readonly name = 'rules';

  private readonly logs = inject(LogRouter);
  private readonly rulesEngine = inject(RulesEngine);

  async init(): Promise<void> {
    await this.rulesEngine.init();
  }

  async load(config: EliaConfig): Promise<void> {
    for (const rule of config.rules.filter((r) => r.enabled)) {
      try {
        await this.rulesEngine.create({
          name: rule.name,
          trigger: { type: 'event', match: rule.event },
          condition: rule.condition,
          actions: [
            {
              tool: rule.action.tool,
              args: rule.action.args as Record<string, Json>,
            },
          ],
          enabled: true,
        });
        this.logs.info('rule.loaded', { name: rule.name });
      } catch (error) {
        this.logs.error('rule.load.failed', { name: rule.name, error: String(error) });
      }
    }
  }

  async stop(): Promise<void> {
    await this.rulesEngine.stop();
  }
}
