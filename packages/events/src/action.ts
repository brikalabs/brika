import { z } from 'zod';
import type { Action } from './types';

/**
 * Symbol used to identify action creators for fast matching
 */
export const ACTION_ID = Symbol.for('elia.action.id');

/**
 * Action creator type returned by defineAction/defineActions
 */
export interface ActionCreator<TType extends string = string, TPayload = unknown> {
  /** Unique symbol for fast O(1) matching */
  readonly [ACTION_ID]: symbol;
  /** Action type string */
  readonly type: TType;
  /** Zod schema for validation */
  readonly schema: z.ZodType<TPayload>;
  /** Create a new action with validated payload */
  create(payload: TPayload, source?: string): Action<TType, TPayload>;
}

/**
 * Helper type to extract the union of all actions from a defineActions result
 */
export type ActionsUnion<T extends Record<string, ActionCreator>> = {
  [K in keyof T]: T[K] extends ActionCreator<infer TType, infer TPayload>
    ? Action<TType, TPayload>
    : never;
}[keyof T];

/**
 * Define a single action without namespace
 *
 * @example
 * const UserLoggedIn = defineAction('user.loggedIn', z.object({
 *   userId: z.string(),
 *   email: z.string(),
 * }));
 *
 * // Usage
 * const action = UserLoggedIn.create({ userId: '123', email: 'test@example.com' });
 * events.dispatch(action);
 *
 * // Subscribe with type inference
 * events.subscribe(UserLoggedIn, (action) => {
 *   console.log(action.payload.userId); // typed as string
 * });
 */
export function defineAction<const TType extends string, TSchema extends z.ZodTypeAny>(
  type: TType,
  schema: TSchema
): ActionCreator<TType, z.infer<TSchema>> {
  type Payload = z.infer<TSchema>;
  const id = Symbol(type);

  return {
    [ACTION_ID]: id,
    type,
    schema: schema as z.ZodType<Payload>,
    create: (payload: Payload, source?: string) => ({
      [ACTION_ID]: id,
      type,
      payload: schema.parse(payload) as Payload,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
      source,
    }),
  };
}

/**
 * Main helper - defines a namespace of actions with Zod schemas
 */
export function defineActions<
  const TNamespace extends string,
  const TActions extends Record<string, z.ZodTypeAny>,
>(
  namespace: TNamespace,
  actions: TActions
): {
  [K in keyof TActions & string]: ActionCreator<`${TNamespace}.${K}`, z.infer<TActions[K]>>;
} {
  const result = {} as {
    [K in keyof TActions & string]: ActionCreator<`${TNamespace}.${K}`, z.infer<TActions[K]>>;
  };

  for (const key in actions) {
    if (Object.hasOwn(actions, key)) {
      const schema = actions[key];
      const type = `${namespace}.${key}`;
      const id = Symbol(type);

      (result as Record<string, ActionCreator>)[key] = {
        [ACTION_ID]: id,
        type,
        schema,
        create: (payload: z.infer<typeof schema>, source?: string) => ({
          [ACTION_ID]: id,
          type,
          payload: schema.parse(payload),
          timestamp: Date.now(),
          id: crypto.randomUUID(),
          source,
        }),
      };
    }
  }

  return result;
}
