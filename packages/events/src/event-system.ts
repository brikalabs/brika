import type { ActionCreator } from './action';
import { createPatternSet, matchesPatternSet } from './matcher';
import { SubscriberManager } from './subscriber';
import type {
  Action,
  ActionPattern,
  InferAction,
  InferActions,
  InferActionsFromMap,
  Unsubscribe,
} from './types';

interface PendingPromise {
  patternSet: Set<symbol>;
  predicate?: (action: Action) => boolean;
  resolve: (action: Action) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

type GlobalHandler = (action: Action) => void | Promise<void>;

export class EventSystem {
  private readonly subscribers = new SubscriberManager();
  private readonly globalSubscribers = new Set<GlobalHandler>();
  private readonly pendingPromises = new Set<PendingPromise>();

  /**
   * Dispatch an action to all matching subscribers
   * Returns a Promise that resolves when all async handlers complete
   *
   * @example
   * // Fire and forget
   * events.dispatch(action);
   *
   * @example
   * // Wait for all handlers to complete
   * await events.dispatch(action);
   */
  async dispatch<T extends Action>(action: T): Promise<T> {
    const promises = this.#notifyGlobalSubscribers(action);
    promises.push(...this.subscribers.notify(action));
    this.#resolvePendingPromises(action);

    if (promises.length > 0) {
      await Promise.all(promises);
    }
    return action;
  }

  #notifyGlobalSubscribers(action: Action): Promise<void>[] {
    const promises: Promise<void>[] = [];
    for (const handler of this.globalSubscribers) {
      try {
        const result = handler(action);
        if (result instanceof Promise) {
          promises.push(result.catch((e) => console.error('Error in global event subscriber:', e)));
        }
      } catch (error) {
        console.error('Error in global event subscriber:', error);
      }
    }
    return promises;
  }

  #resolvePendingPromises(action: Action): void {
    for (const pending of this.pendingPromises) {
      if (!matchesPatternSet(pending.patternSet, action)) continue;
      if (pending.predicate && !pending.predicate(action)) continue;

      if (pending.timeout) clearTimeout(pending.timeout);
      this.pendingPromises.delete(pending);
      pending.resolve(action);
    }
  }

  /**
   * Subscribe to actions matching a pattern
   *
   * @example
   * // Single action creator - handler is typed
   * events.subscribe(TestActions.hello, (action) => {
   *   console.log(action.payload.message); // typed as string
   * });
   *
   * @example
   * // Array of action creators - handler is union type
   * events.subscribe([TestActions.hello, TestActions.goodbye], (action) => {
   *   if (action.type === 'test.hello') {
   *     console.log(action.payload.message);
   *   }
   * });
   *
   * @example
   * // Action map (result of defineActions) - handler is union type
   * events.subscribe(TestActions, (action) => {
   *   console.log(action.type);
   * });
   */
  subscribe<T extends ActionCreator>(
    pattern: T,
    handler: (action: InferAction<T>) => void | Promise<void>
  ): Unsubscribe;
  subscribe<T extends readonly ActionCreator[]>(
    pattern: T,
    handler: (action: InferActions<T>) => void | Promise<void>
  ): Unsubscribe;
  subscribe<T extends Record<string, ActionCreator>>(
    pattern: T,
    handler: (action: InferActionsFromMap<T>) => void | Promise<void>
  ): Unsubscribe;
  subscribe(
    pattern: ActionPattern,
    handler: (action: Action) => void | Promise<void>
  ): Unsubscribe {
    return this.subscribers.subscribe(pattern, handler);
  }

  /**
   * Wait for a single action matching the pattern
   *
   * @example
   * const action = await events.once(TestActions.hello, { timeout: 1000 });
   * console.log(action.payload.message); // typed as string
   */
  once<T extends ActionCreator>(
    pattern: T,
    options?: { timeout?: number }
  ): Promise<InferAction<T>>;
  once<T extends readonly ActionCreator[]>(
    pattern: T,
    options?: { timeout?: number }
  ): Promise<InferActions<T>>;
  once<T extends Record<string, ActionCreator>>(
    pattern: T,
    options?: { timeout?: number }
  ): Promise<InferActionsFromMap<T>>;
  once(pattern: ActionPattern, options?: { timeout?: number }): Promise<Action> {
    return new Promise<Action>((resolve, reject) => {
      const patternSet = createPatternSet(pattern);

      const pending: PendingPromise = {
        patternSet,
        resolve,
        reject,
      };

      if (options?.timeout) {
        pending.timeout = setTimeout(() => {
          this.pendingPromises.delete(pending);
          reject(new Error('Timeout waiting for action'));
        }, options.timeout);
      }

      this.pendingPromises.add(pending);
    });
  }

  /**
   * Wait for the first action matching any of the patterns (race)
   *
   * @example
   * const action = await events.race([TestActions.hello, TestActions.goodbye], { timeout: 1000 });
   */
  race<T extends readonly ActionCreator[]>(
    patterns: T,
    options?: { timeout?: number }
  ): Promise<InferActions<T>>;
  race<T extends Record<string, ActionCreator>>(
    patterns: T,
    options?: { timeout?: number }
  ): Promise<InferActionsFromMap<T>>;
  race(patterns: ActionPattern, options?: { timeout?: number }): Promise<Action> {
    return new Promise<Action>((resolve, reject) => {
      const patternSet = createPatternSet(patterns);
      let resolved = false;

      const handleResolve = (action: Action) => {
        if (!resolved) {
          resolved = true;
          if (pending.timeout) {
            clearTimeout(pending.timeout);
          }
          this.pendingPromises.delete(pending);
          resolve(action);
        }
      };

      const handleReject = (error: Error) => {
        if (!resolved) {
          resolved = true;
          this.pendingPromises.delete(pending);
          reject(error);
        }
      };

      const pending: PendingPromise = {
        patternSet,
        resolve: handleResolve,
        reject: handleReject,
      };

      if (options?.timeout) {
        pending.timeout = setTimeout(() => {
          handleReject(new Error('Timeout waiting for action'));
        }, options.timeout);
      }

      this.pendingPromises.add(pending);
    });
  }

  /**
   * Wait for an action matching the pattern and predicate
   *
   * @example
   * const action = await events.waitFor(
   *   TestActions.count,
   *   (action) => action.payload.value > 10,
   *   { timeout: 1000 }
   * );
   */
  waitFor<T extends ActionCreator>(
    pattern: T,
    predicate: (action: InferAction<T>) => boolean,
    options?: { timeout?: number }
  ): Promise<InferAction<T>>;
  waitFor<T extends readonly ActionCreator[]>(
    pattern: T,
    predicate: (action: InferActions<T>) => boolean,
    options?: { timeout?: number }
  ): Promise<InferActions<T>>;
  waitFor<T extends Record<string, ActionCreator>>(
    pattern: T,
    predicate: (action: InferActionsFromMap<T>) => boolean,
    options?: { timeout?: number }
  ): Promise<InferActionsFromMap<T>>;
  waitFor(
    pattern: ActionPattern,
    predicate: (action: Action) => boolean,
    options?: { timeout?: number }
  ): Promise<Action> {
    return new Promise<Action>((resolve, reject) => {
      const patternSet = createPatternSet(pattern);

      const pending: PendingPromise = {
        patternSet,
        predicate,
        resolve,
        reject,
      };

      if (options?.timeout) {
        pending.timeout = setTimeout(() => {
          this.pendingPromises.delete(pending);
          reject(new Error('Timeout waiting for action'));
        }, options.timeout);
      }

      this.pendingPromises.add(pending);
    });
  }

  /**
   * Subscribe to ALL dispatched actions (no pattern matching)
   * Useful for logging, debugging, or history tracking
   *
   * @example
   * events.subscribeAll((action) => {
   *   console.log('Action:', action.type, action.payload);
   * });
   */
  subscribeAll(handler: (action: Action) => void | Promise<void>): Unsubscribe {
    this.globalSubscribers.add(handler);
    return () => {
      this.globalSubscribers.delete(handler);
    };
  }

  /**
   * Subscribe to actions matching a glob pattern string
   * Useful for dynamic runtime subscriptions (e.g., from plugins)
   *
   * @example
   * // Subscribe to all motion events
   * events.subscribeGlob("motion.*", (action) => {
   *   console.log("Motion event:", action.type);
   * });
   *
   * // Subscribe to multiple patterns
   * events.subscribeGlob(["light.*", "switch.*"], (action) => {
   *   console.log("Light or switch event:", action.type);
   * });
   */
  subscribeGlob(
    patterns: string | string[],
    handler: (action: Action) => void | Promise<void>
  ): Unsubscribe {
    const patternList = Array.isArray(patterns) ? patterns : [patterns];
    const regexes = patternList.map(
      (p) => new RegExp(`^${p.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`)
    );

    const wrappedHandler: GlobalHandler = (action) => {
      if (regexes.some((r) => r.test(action.type))) {
        return handler(action);
      }
    };

    this.globalSubscribers.add(wrappedHandler);
    return () => {
      this.globalSubscribers.delete(wrappedHandler);
    };
  }

  /**
   * Clear all subscriptions and pending promises
   */
  clear(): void {
    for (const pending of this.pendingPromises) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingPromises.clear();
    this.subscribers.clear();
    this.globalSubscribers.clear();
  }
}
