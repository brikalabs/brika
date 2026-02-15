import { inject, singleton } from '@brika/di';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import type { Loader } from './loader';

@singleton()
export class BoardsLoader implements Loader {
  readonly name = 'boards';

  private readonly boardLoader = inject(BoardLoader);
  private readonly boardService = inject(BoardService);
  private readonly configLoader = inject(ConfigLoader);
  private readonly events = inject(EventSystem);
  private unsubTypeRegistered: (() => void) | null = null;

  async load(_config: BrikaConfig): Promise<void> {
    // Mount instances when boards are hot-reloaded (only if actively viewed)
    this.boardLoader.onChange((id, action) => {
      if (action === 'load' && this.boardService.hasActiveViewers(id)) {
        const board = this.boardLoader.get(id);
        if (board) this.boardService.mountBoard(board);
      }
    });

    // When a brick type is registered (plugin ready), mount any pending placements.
    // This solves the race where boards load before plugins finish starting.
    this.unsubTypeRegistered = this.events.subscribe(BrickActions.typeRegistered, (action) => {
      this.boardService.mountPendingForType(action.payload.brickTypeId);
    });

    // Load YAML boards with hot-reload
    await this.boardLoader.loadDir(`${this.configLoader.getBrikaDir()}/boards`);
    this.boardLoader.watch();
  }

  async stop(): Promise<void> {
    this.unsubTypeRegistered?.();
    this.boardLoader.stopWatching();

    // Unmount all board instances
    for (const board of this.boardLoader.list()) {
      this.boardService.unmountBoard(board);
    }
  }
}
