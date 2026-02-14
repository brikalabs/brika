/**
 * Channel Delegate Mixin
 *
 * Shared send/on/implement/call methods that delegate to an underlying Channel.
 * Used by both PluginChannel (host) and Client (plugin).
 */

import type { Channel } from './channel';
import type { InputOf, MessageDef, OutputOf, PayloadOf, RpcDef } from './define';

/**
 * Interface for objects that expose a Channel.
 */
export interface HasChannel {
  get channel(): Channel;
}

/**
 * Apply channel delegate methods to a class prototype.
 *
 * Adds: send, on, implement, call — all delegating to this.channel.
 */
// biome-ignore lint/suspicious/noExplicitAny: mixin pattern needs flexible constructor signature
export function applyChannelDelegate<T extends new (...args: any[]) => HasChannel>(
  target: T
): void {
  target.prototype.send = function <M extends MessageDef>(
    this: HasChannel,
    def: M,
    payload: PayloadOf<M>
  ): void {
    this.channel.send(def, payload);
  };

  target.prototype.on = function <M extends MessageDef>(
    this: HasChannel,
    def: M,
    handler: (payload: PayloadOf<M>) => void | Promise<void>
  ): () => void {
    return this.channel.on(def, handler);
  };

  target.prototype.implement = function <R extends RpcDef>(
    this: HasChannel,
    def: R,
    handler: (input: InputOf<R>) => OutputOf<R> | Promise<OutputOf<R>>
  ): void {
    this.channel.implement(def, handler);
  };

  target.prototype.call = function <R extends RpcDef>(
    this: HasChannel,
    def: R,
    input: InputOf<R>,
    timeoutMs?: number
  ): Promise<OutputOf<R>> {
    return this.channel.call(def, input, timeoutMs);
  };
}

/**
 * Interface for the delegate methods added by applyChannelDelegate.
 */
export interface ChannelDelegateMethods {
  send<T extends MessageDef>(def: T, payload: PayloadOf<T>): void;
  on<T extends MessageDef>(
    def: T,
    handler: (payload: PayloadOf<T>) => void | Promise<void>
  ): () => void;
  implement<T extends RpcDef>(
    def: T,
    handler: (input: InputOf<T>) => OutputOf<T> | Promise<OutputOf<T>>
  ): void;
  call<T extends RpcDef>(def: T, input: InputOf<T>, timeoutMs?: number): Promise<OutputOf<T>>;
}
