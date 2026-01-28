import { inject, singleton } from '@brika/di';
import type { BrikaConfig } from '@/runtime/config';
import { I18nService } from '@/runtime/i18n';
import type { Loader } from './loader';

@singleton()
export class I18nLoader implements Loader {
  readonly name = 'i18n';

  private readonly i18n = inject(I18nService);

  async init(): Promise<void> {
    await this.i18n.init();
  }

  async load(_config: BrikaConfig): Promise<void> {
    // I18n is initialized in init(), nothing to load from config
  }
}
