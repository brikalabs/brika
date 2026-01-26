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

/** Check if action matches item (with optional predicate) */
function matchesItem(item: PatternItem, action: Action, actionId: symbol): boolean {
  const creator = getCreator(item);
  if (actionId !== creator[ACTION_ID]) {
    return false;
  }

  if (isFilteredAction(item) && !item.predicate(action)) {
    return false;
  }

  return true;
}

/** Match action against array of patterns */
function matchesArray(pattern: readonly PatternItem[], action: Action, actionId: symbol): boolean {
  for (const item of pattern) {
    if (matchesItem(item, action, actionId)) {
      return true;
    }
  }
  return false;
}

/** Match action against action map */
function matchesMap(
  pattern: Record<string, PatternItem>,
  action: Action,
  actionId: symbol
): boolean {
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key)) {
      const item = pattern[key];
      if (item && matchesItem(item, action, actionId)) {
        return true;
      }
    }
  }
  return false;
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

  // Array of ActionCreators/FilteredActions
  if (isActionCreatorArray(pattern)) {
    return matchesArray(pattern, action, actionId);
  }

  // ActionMap (object with ActionCreators)
  return matchesMap(pattern, action, actionId);
}

export interface PatternSetResult {
  ids: Set<symbol>;
  predicates: Map<symbol, (action: Action) => boolean>;
}

/** Add item to pattern set */
function addToPatternSet(
  item: PatternItem,
  ids: Set<symbol>,
  predicates: Map<symbol, (action: Action) => boolean>
): void {
  if (isFilteredAction(item)) {
    const id = item.creator[ACTION_ID];
    ids.add(id);
    predicates.set(id, item.predicate);
  } else {
    ids.add(item[ACTION_ID]);
  }
}

/** Process array pattern into pattern set */
function processArrayPattern(
  pattern: readonly PatternItem[],
  ids: Set<symbol>,
  predicates: Map<symbol, (action: Action) => boolean>
): void {
  for (const item of pattern) {
    addToPatternSet(item, ids, predicates);
  }
}

/** Process map pattern into pattern set */
function processMapPattern(
  pattern: Record<string, PatternItem>,
  ids: Set<symbol>,
  predicates: Map<symbol, (action: Action) => boolean>
): void {
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key)) {
      const item = pattern[key];
      if (item) {
        addToPatternSet(item, ids, predicates);
      }
    }
  }
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
    processArrayPattern(pattern, ids, predicates);
  } else {
    processMapPattern(pattern, ids, predicates);
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
