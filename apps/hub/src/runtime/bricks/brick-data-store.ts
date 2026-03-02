import { singleton } from '@brika/di';

@singleton()
export class BrickDataStore {
  readonly #data = new Map<string, unknown>();

  set(brickTypeId: string, data: unknown): void {
    this.#data.set(brickTypeId, data);
  }

  get(brickTypeId: string): unknown {
    return this.#data.get(brickTypeId);
  }

  removeByPlugin(pluginName: string): void {
    for (const key of this.#data.keys()) {
      if (key.startsWith(`${pluginName}:`)) {
        this.#data.delete(key);
      }
    }
  }
}
