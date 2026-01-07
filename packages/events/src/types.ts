import type { ACTION_ID, ActionCreator } from './action';

/**
 * Action dispatched through the event system
 */
export interface Action<TType extends string = string, TPayload = unknown> {
  /** Symbol for fast O(1) matching with ActionCreator */
  readonly [ACTION_ID]: symbol;
  /** Action type string */
  readonly type: TType;
  /** Action payload */
  readonly payload: TPayload;
  /** Timestamp when action was created */
  readonly timestamp: number;
  /** Unique action ID */
  readonly id: string;
  /** Source of the action */
  readonly source?: string;
}

/**
 * Handler function for subscriptions
 */
export type Subscriber<T extends Action = Action> = (action: T) => void | Promise<void>;

/**
 * Unsubscribe callback returned by subscribe methods.
 * Call this function to remove the subscription.
 */
export type Unsubscribe = () => void;

/** Symbol to identify filtered action patterns */
export const FILTERED_ACTION = Symbol('FilteredAction');

/** A filtered action pattern with a predicate */
export interface FilteredAction<T extends ActionCreator = ActionCreator> {
  [FILTERED_ACTION]: true;
  creator: T;
  predicate: (action: InferAction<T>) => boolean;
}

/** Pattern item that can be ActionCreator or FilteredAction */
export type PatternItem = ActionCreator | FilteredAction;

/**
 * Valid pattern types for matching actions
 */
export type ActionPattern =
  | ActionCreator
  | FilteredAction
  | readonly PatternItem[]
  | Record<string, PatternItem>;

/**
 * Extract action type from ActionCreator or FilteredAction
 */
export type InferAction<T> =
  T extends FilteredAction<infer C>
    ? C extends ActionCreator<infer TType, infer TPayload>
      ? Action<TType, TPayload>
      : Action
    : T extends ActionCreator<infer TType, infer TPayload>
      ? Action<TType, TPayload>
      : Action;

/**
 * Extract union of action types from array of PatternItems (ActionCreator or FilteredAction)
 */
export type InferActions<T extends readonly PatternItem[]> = {
  [K in keyof T]: InferAction<T[K]>;
}[number];

/**
 * Extract union of action types from ActionMap (result of defineActions)
 */
export type InferActionsFromMap<T extends Record<string, PatternItem>> = {
  [K in keyof T]: InferAction<T[K]>;
}[keyof T];

// Re-export ActionCreator from action.ts
export type { ActionCreator } from './action';
