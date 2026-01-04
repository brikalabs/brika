import { ACTION_ID, type ActionCreator } from './action';
import type { Action, ActionPattern } from './types';

/**
 * Check if pattern is a single ActionCreator
 */
function isActionCreator(pattern: ActionPattern): pattern is ActionCreator {
  return ACTION_ID in pattern && !Array.isArray(pattern);
}

/**
 * Check if pattern is an array of ActionCreators
 */
function isActionCreatorArray(pattern: ActionPattern): pattern is readonly ActionCreator[] {
  return Array.isArray(pattern);
}

/**
 * Match an action against a pattern using Symbol comparison (O(1))
 */
export function matchesPattern(pattern: ActionPattern, action: Action): boolean {
  const actionId = action[ACTION_ID];

  // Single ActionCreator - O(1) symbol comparison
  if (isActionCreator(pattern)) {
    return actionId === pattern[ACTION_ID];
  }

  // Array of ActionCreators - O(n) but typically small
  if (isActionCreatorArray(pattern)) {
    for (const creator of pattern) {
      if (actionId === creator[ACTION_ID]) {
        return true;
      }
    }
    return false;
  }

  // ActionMap (object with ActionCreators) - O(n) but typically small
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key)) {
      if (actionId === pattern[key][ACTION_ID]) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create a Set of action IDs for O(1) matching with multiple patterns
 * Use this when subscribing to many action types for better performance
 */
export function createPatternSet(pattern: ActionPattern): Set<symbol> {
  const ids = new Set<symbol>();

  if (isActionCreator(pattern)) {
    ids.add(pattern[ACTION_ID]);
  } else if (isActionCreatorArray(pattern)) {
    for (const creator of pattern) {
      ids.add(creator[ACTION_ID]);
    }
  } else {
    for (const key in pattern) {
      if (Object.hasOwn(pattern, key)) {
        ids.add(pattern[key][ACTION_ID]);
      }
    }
  }

  return ids;
}

/**
 * Fast match using pre-computed Set (O(1))
 */
export function matchesPatternSet(patternSet: Set<symbol>, action: Action): boolean {
  return patternSet.has(action[ACTION_ID]);
}
