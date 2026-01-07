import { ACTION_ID, type ActionCreator } from './action';
import {
  type Action,
  type ActionPattern,
  FILTERED_ACTION,
  type FilteredAction,
  type InferAction,
  type PatternItem,
} from './types';

/**
 * Wrap an ActionCreator with a predicate filter
 *
 * @example
 * const myPluginLoaded = withPredicate(PluginActions.loaded, (a) => a.payload.uid === uid);
 * const result = await events.race([myPluginLoaded, myPluginError]);
 */
export function withPredicate<T extends ActionCreator>(
  creator: T,
  predicate: (action: InferAction<T>) => boolean
): FilteredAction<T> {
  return {
    [FILTERED_ACTION]: true,
    creator,
    predicate,
  };
}

/** Check if value is a FilteredAction */
export function isFilteredAction(value: unknown): value is FilteredAction {
  return typeof value === 'object' && value !== null && FILTERED_ACTION in value;
}

/**
 * Check if pattern is a single ActionCreator
 */
function isActionCreator(pattern: ActionPattern): pattern is ActionCreator {
  return ACTION_ID in pattern && !Array.isArray(pattern) && !isFilteredAction(pattern);
}

/**
 * Check if pattern is an array of ActionCreators (or FilteredActions)
 */
function isActionCreatorArray(pattern: ActionPattern): pattern is readonly PatternItem[] {
  return Array.isArray(pattern);
}

/** Get ActionCreator from pattern item (handles FilteredAction) */
function getCreator(item: PatternItem): ActionCreator {
  return isFilteredAction(item) ? item.creator : item;
}

/**
 * Match an action against a pattern using Symbol comparison (O(1))
 */
export function matchesPattern(pattern: ActionPattern, action: Action): boolean {
  const actionId = action[ACTION_ID];

  // FilteredAction - check symbol + predicate
  if (isFilteredAction(pattern)) {
    return actionId === pattern.creator[ACTION_ID] && pattern.predicate(action);
  }

  // Single ActionCreator - O(1) symbol comparison
  if (isActionCreator(pattern)) {
    return actionId === pattern[ACTION_ID];
  }

  // Array of ActionCreators/FilteredActions - O(n) but typically small
  if (isActionCreatorArray(pattern)) {
    for (const item of pattern) {
      const creator = getCreator(item);
      if (actionId === creator[ACTION_ID]) {
        // Check predicate if FilteredAction
        if (isFilteredAction(item) && !item.predicate(action)) {
          continue;
        }
        return true;
      }
    }
    return false;
  }

  // ActionMap (object with ActionCreators) - O(n) but typically small
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key)) {
      const item = pattern[key];
      if (item) {
        const creator = getCreator(item);
        if (actionId === creator[ACTION_ID]) {
          if (isFilteredAction(item) && !item.predicate(action)) {
            continue;
          }
          return true;
        }
      }
    }
  }

  return false;
}

export interface PatternSetResult {
  ids: Set<symbol>;
  predicates: Map<symbol, (action: Action) => boolean>;
}

/**
 * Create a Set of action IDs for O(1) matching with multiple patterns
 * Also returns predicates map for FilteredActions
 */
export function createPatternSet(pattern: ActionPattern): PatternSetResult {
  const ids = new Set<symbol>();
  const predicates = new Map<symbol, (action: Action) => boolean>();

  if (isFilteredAction(pattern)) {
    const id = pattern.creator[ACTION_ID];
    ids.add(id);
    predicates.set(id, pattern.predicate);
  } else if (isActionCreator(pattern)) {
    ids.add(pattern[ACTION_ID]);
  } else if (isActionCreatorArray(pattern)) {
    for (const item of pattern) {
      if (isFilteredAction(item)) {
        const id = item.creator[ACTION_ID];
        ids.add(id);
        predicates.set(id, item.predicate);
      } else {
        ids.add(item[ACTION_ID]);
      }
    }
  } else {
    for (const key in pattern) {
      if (Object.hasOwn(pattern, key)) {
        const item = pattern[key];
        if (item) {
          if (isFilteredAction(item)) {
            const id = item.creator[ACTION_ID];
            ids.add(id);
            predicates.set(id, item.predicate);
          } else {
            ids.add(item[ACTION_ID]);
          }
        }
      }
    }
  }

  return { ids, predicates };
}

/**
 * Fast match using pre-computed Set (O(1)) with optional predicates
 */
export function matchesPatternSet(result: PatternSetResult, action: Action): boolean {
  const actionId = action[ACTION_ID];
  if (!result.ids.has(actionId)) return false;

  const predicate = result.predicates.get(actionId);
  if (predicate && !predicate(action)) return false;

  return true;
}
