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

/**
 * Valid pattern types for matching actions
 */
export type ActionPattern =
  | ActionCreator
  | readonly ActionCreator[]
  | Record<string, ActionCreator>;

/**
 * Extract action type from ActionCreator
 */
export type InferAction<T> =
  T extends ActionCreator<infer TType, infer TPayload> ? Action<TType, TPayload> : Action;

/**
 * Extract union of action types from array of ActionCreators
 */
export type InferActions<T extends readonly ActionCreator[]> = {
  [K in keyof T]: T[K] extends ActionCreator<infer TType, infer TPayload>
    ? Action<TType, TPayload>
    : never;
}[number];

/**
 * Extract union of action types from ActionMap (result of defineActions)
 */
export type InferActionsFromMap<T extends Record<string, ActionCreator>> = {
  [K in keyof T]: T[K] extends ActionCreator<infer TType, infer TPayload>
    ? Action<TType, TPayload>
    : never;
}[keyof T];

// Re-export ActionCreator from action.ts
export type { ActionCreator } from './action';
