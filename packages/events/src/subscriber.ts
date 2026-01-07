import { createPatternSet, matchesPatternSet, type PatternSetResult } from './matcher';
import type { Action, ActionPattern, Subscriber, Unsubscribe } from './types';

export interface Subscription {
  /** Pre-computed pattern matching data for O(1) matching */
  patternSet: PatternSetResult;
  handler: Subscriber;
  unsubscribe: Unsubscribe;
}

export class SubscriberManager {
  private readonly subscriptions = new Set<Subscription>();

  subscribe<T extends Action>(pattern: ActionPattern, handler: Subscriber<T>): Unsubscribe {
    // Pre-compute the pattern set for O(1) matching
    const patternSet = createPatternSet(pattern);

    const subscription: Subscription = {
      patternSet,
      handler: handler as Subscriber,
      unsubscribe: () => {
        this.subscriptions.delete(subscription);
      },
    };

    this.subscriptions.add(subscription);
    return subscription.unsubscribe;
  }

  /**
   * Notify all matching subscribers and return promises from async handlers
   */
  notify(action: Action): Promise<void>[] {
    const promises: Promise<void>[] = [];

    for (const subscription of this.subscriptions) {
      // O(1) symbol lookup in Set
      if (matchesPatternSet(subscription.patternSet, action)) {
        try {
          const result = subscription.handler(action);
          if (result instanceof Promise) {
            promises.push(
              result.catch((error) => {
                console.error('Error in event subscriber:', error);
              })
            );
          }
        } catch (error) {
          console.error('Error in event subscriber:', error);
        }
      }
    }

    return promises;
  }

  clear(): void {
    this.subscriptions.clear();
  }

  get size(): number {
    return this.subscriptions.size;
  }
}
