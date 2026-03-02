import { inject, singleton } from '@brika/di';
import { BoardLoader } from '@/runtime/boards';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import type { Loader } from './loader';

@singleton()
export class BoardsLoader implements Loader {
  readonly name = 'boards';

  private readonly boardLoader = inject(BoardLoader);
  private readonly configLoader = inject(ConfigLoader);

  async load(_config: BrikaConfig): Promise<void> {
    // Load YAML boards with hot-reload
    await this.boardLoader.loadDir(`${this.configLoader.getBrikaDir()}/boards`);
    this.boardLoader.watch();
  }

  stop(): Promise<void> {
    this.boardLoader.stopWatching();
    return Promise.resolve();
  }
}
